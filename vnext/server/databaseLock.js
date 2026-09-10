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

// Linux PID 1 is reused on container restarts. PID alone cannot identify
// the process that created a persisted lock. Old/non-Linux locks keep the
// conservative PID-only behavior. Never share this DB across PID namespaces.
function processIdentity(pid) {
  if (process.platform !== 'linux') return null;
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const boot = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
    return `${boot}:${fields[19]}`;
  } catch { return null; }
}

function readDatabaseLock(databasePath) {
  if (!databasePath || databasePath === ':memory:') return null;
  const lockPath = databaseLockPath(databasePath);
  try {
    const record = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const currentIdentity = processIdentity(record.pid);
    const sameProcess = !record.processIdentity || !currentIdentity || record.processIdentity === currentIdentity;
    return { ...record, lockPath, active: processIsRunning(record.pid) && sameProcess };
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
  const record = { owner, pid: process.pid, nonce, processIdentity: processIdentity(process.pid), startedAt: new Date().toISOString() };

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
