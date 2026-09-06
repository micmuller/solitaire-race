'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function databaseLockPath(databasePath) {
  return `${path.resolve(databasePath)}.lock`;
}

function processIsRunning(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function readDatabaseLock(databasePath) {
  if (!databasePath || databasePath === ':memory:') return null;
  const lockPath = databaseLockPath(databasePath);
  try {
    const record = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    return { ...record, lockPath, active: processIsRunning(record.pid) };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    return { lockPath, active: false, invalid: true };
  }
}

function acquireDatabaseLock(databasePath, owner) {
  if (!databasePath || databasePath === ':memory:') return () => {};
  const lockPath = databaseLockPath(databasePath);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const nonce = crypto.randomUUID();
  const record = { owner, pid: process.pid, nonce, startedAt: new Date().toISOString() };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(descriptor, `${JSON.stringify(record)}\n`);
      fs.closeSync(descriptor);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        try {
          const current = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
          if (current.nonce === nonce) fs.unlinkSync(lockPath);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = readDatabaseLock(databasePath);
      if (existing?.active) {
        const locked = new Error(`database is in use by ${existing.owner || 'another process'} (PID ${existing.pid})`);
        locked.code = 'DATABASE_IN_USE';
        locked.lock = existing;
        throw locked;
      }
      fs.unlinkSync(lockPath);
    }
  }
  throw new Error('could not acquire database lock');
}

module.exports = { acquireDatabaseLock, databaseLockPath, readDatabaseLock };
