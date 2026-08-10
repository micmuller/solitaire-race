'use strict';

const { WebSocket } = require('ws');
const { PLAYER_IDS, PROTOCOL_VERSION } = require('../core/constants');

function websocketUrl(baseUrl, matchId, clientId) {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/vnext';
  url.search = new URLSearchParams({ matchId, clientId }).toString();
  return url.toString();
}

function validateAuthoritativeResponse(response, matchId) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return 'response must be an object';
  if (!['ack', 'reject', 'snapshot'].includes(response.kind)) return 'response kind is invalid';
  if (response.matchId !== matchId) return 'response matchId does not match';
  if (response.protocolVersion !== PROTOCOL_VERSION) return 'response protocolVersion does not match';
  if (!Number.isSafeInteger(response.rev) || response.rev < 0) return 'response rev is invalid';
  if (!/^[0-9a-f]{64}$/.test(response.stateHash)) return 'response stateHash is invalid';
  if ((response.kind === 'ack' || response.kind === 'snapshot')
    && (!response.state || typeof response.state !== 'object' || Array.isArray(response.state))) {
    return 'authoritative response state is invalid';
  }
  if (response.kind === 'reject' && typeof response.code !== 'string') return 'reject code is invalid';
  return null;
}

class ProtocolClient {
  constructor({ baseUrl, matchId, clientId, WebSocketImpl = WebSocket }) {
    if (typeof baseUrl !== 'string' || baseUrl.length === 0) throw new TypeError('baseUrl is required');
    if (typeof matchId !== 'string' || matchId.length === 0) throw new TypeError('matchId is required');
    if (!PLAYER_IDS.includes(clientId)) throw new TypeError('clientId must be p1 or p2');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.matchId = matchId;
    this.clientId = clientId;
    this.WebSocketImpl = WebSocketImpl;
    this.socket = null;
    this.current = null;
    this.nextSeq = 0;
    this.pending = null;
    this.listeners = new Set();
    this.messageQueue = Promise.resolve();
  }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event) {
    for (const listener of this.listeners) listener(event, this);
  }

  connect() {
    if (this.socket) return Promise.reject(new Error('client is already connected'));
    return new Promise((resolve, reject) => {
      const socket = new this.WebSocketImpl(websocketUrl(this.baseUrl, this.matchId, this.clientId));
      this.socket = socket;
      let settled = false;

      socket.on('message', (data) => {
        this.messageQueue = this.messageQueue
          .then(() => this.handleMessage(data))
          .then((response) => {
            if (!settled && response.kind === 'snapshot') {
              settled = true;
              resolve(response);
            }
          })
          .catch((error) => {
            this.emit({ type: 'protocolError', error });
            if (!settled) {
              settled = true;
              reject(error);
            }
          });
      });
      socket.once('error', (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
      socket.on('close', () => {
        this.socket = null;
        if (!settled) {
          settled = true;
          reject(new Error('connection closed before initial snapshot'));
        }
        if (this.pending) {
          this.pending.reject(new Error('connection closed while action was pending'));
          this.pending = null;
        }
        this.emit({ type: 'disconnected' });
      });
    });
  }

  async handleMessage(raw) {
    const response = JSON.parse(raw.toString('utf8'));
    const validationError = validateAuthoritativeResponse(response, this.matchId);
    if (validationError) throw new Error(`Invalid server response: ${validationError}`);

    if (response.kind === 'ack' || response.kind === 'snapshot') {
      const isRestart = response.kind === 'snapshot' && response.reason === 'RESTART';
      if (isRestart) this.nextSeq = 0;
      if (!this.current || response.rev >= this.current.rev || isRestart) {
        this.current = { rev: response.rev, state: response.state, stateHash: response.stateHash };
        this.emit({ type: 'state', source: response.kind, current: this.current });
      }
    }

    if (this.pending) {
      const ownAck = response.kind === 'ack'
        && response.clientId === this.clientId
        && response.seq === this.pending.seq;
      const ownReject = response.kind === 'reject' && response.clientId === this.clientId;
      const recoverySnapshot = response.kind === 'snapshot' && response.reason !== 'INITIAL_CONNECT';
      if (ownAck || ownReject || recoverySnapshot) {
        const pending = this.pending;
        this.pending = null;
        if (ownAck) this.nextSeq += 1;
        if (ownReject && response.code === 'DUPLICATE_SEQ' && Number.isSafeInteger(response.expectedSeq)) {
          this.nextSeq = response.expectedSeq;
        }
        pending.resolve(response);
      }
    }

    this.emit({ type: 'response', response });
    return response;
  }

  sendIntent(kind, payload) {
    if (!this.socket || this.socket.readyState !== this.WebSocketImpl.OPEN || !this.current) {
      return Promise.reject(new Error('client is not ready'));
    }
    if (this.pending) return Promise.reject(new Error('an action is already pending'));
    if (typeof kind !== 'string' || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return Promise.reject(new TypeError('kind and payload are required'));
    }

    const envelope = {
      matchId: this.matchId,
      clientId: this.clientId,
      seq: this.nextSeq,
      baseRev: this.current.rev,
      protocolVersion: PROTOCOL_VERSION,
      kind,
      payload
    };
    return new Promise((resolve, reject) => {
      this.pending = { seq: this.nextSeq, resolve, reject };
      this.socket.send(JSON.stringify(envelope), (error) => {
        if (error && this.pending) {
          this.pending = null;
          reject(error);
        }
      });
    });
  }

  close() {
    if (this.socket) this.socket.close(1000, 'client closed');
  }
}

async function createMatch(baseUrl, { seed, mode }, fetchImpl = fetch) {
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/vnext/matches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed, mode })
  });
  if (!response.ok) throw new Error(`Match creation failed: HTTP ${response.status}`);
  return response.json();
}

async function restartMatch(baseUrl, matchId, { seed, mode }, fetchImpl = fetch) {
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/vnext/matches/${encodeURIComponent(matchId)}/restart`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed, mode })
  });
  if (!response.ok) throw new Error(`Match restart failed: HTTP ${response.status}`);
  return response.json();
}

module.exports = { ProtocolClient, createMatch, restartMatch, validateAuthoritativeResponse, websocketUrl };
