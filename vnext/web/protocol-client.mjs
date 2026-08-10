export const PROTOCOL_VERSION = '2.5.2';

export class ProtocolClient {
  constructor({ baseUrl, matchId, clientId }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.matchId = matchId;
    this.clientId = clientId;
    this.current = null;
    this.nextSeq = 0;
    this.pending = null;
    this.socket = null;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event) {
    for (const listener of this.listeners) listener(event, this);
  }

  connect() {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.pathname = '/vnext';
      url.search = new URLSearchParams({ matchId: this.matchId, clientId: this.clientId });
      const socket = new WebSocket(url);
      this.socket = socket;
      let ready = false;

      socket.addEventListener('message', (event) => {
        try {
          const response = JSON.parse(event.data);
          this.handle(response);
          if (!ready && response.kind === 'snapshot') {
            ready = true;
            resolve(response);
          }
        } catch (error) {
          this.emit({ type: 'protocolError', error });
          if (!ready) reject(error);
        }
      });
      socket.addEventListener('error', () => {
        if (!ready) reject(new Error('WebSocket-Verbindung fehlgeschlagen'));
      });
      socket.addEventListener('close', () => {
        this.socket = null;
        if (this.pending) {
          this.pending.reject(new Error('Verbindung während einer Action getrennt'));
          this.pending = null;
        }
        this.emit({ type: 'disconnected' });
      });
    });
  }

  handle(response) {
    if (!response || response.matchId !== this.matchId || response.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error('Ungültige Serverantwort');
    }
    if (response.kind === 'ack' || response.kind === 'snapshot') {
      const isRestart = response.kind === 'snapshot' && response.reason === 'RESTART';
      if (isRestart) this.nextSeq = 0;
      if (!this.current || response.rev >= this.current.rev || isRestart) {
        this.current = { rev: response.rev, stateHash: response.stateHash, state: response.state };
        this.emit({ type: 'state', source: response.kind, current: this.current });
      }
    }
    if (this.pending) {
      const ownAck = response.kind === 'ack' && response.clientId === this.clientId && response.seq === this.pending.seq;
      const ownReject = response.kind === 'reject' && response.clientId === this.clientId;
      const recovery = response.kind === 'snapshot' && response.reason !== 'INITIAL_CONNECT';
      if (ownAck || ownReject || recovery) {
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
  }

  sendIntent(kind, payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.current) {
      return Promise.reject(new Error('Client ist nicht bereit'));
    }
    if (this.pending) return Promise.reject(new Error('Eine Action ist bereits ausstehend'));
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
      this.socket.send(JSON.stringify(envelope));
    });
  }

  close() {
    this.socket?.close(1000, 'client closed');
  }
}

export async function createMatch(baseUrl, seed, mode) {
  const response = await fetch(`${baseUrl}/vnext/matches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed, mode })
  });
  if (!response.ok) throw new Error(`Matcherstellung fehlgeschlagen (${response.status})`);
  return response.json();
}

export async function createLobbySession(baseUrl, { sessionId, nickname }) {
  const response = await fetch(`${baseUrl}/vnext/lobby/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, nickname })
  });
  if (!response.ok) throw new Error(`Lobby-Anmeldung fehlgeschlagen (${response.status})`);
  return response.json();
}

export async function listLobbyGames(baseUrl) {
  const response = await fetch(`${baseUrl}/vnext/lobby/games`);
  if (!response.ok) throw new Error(`Lobby konnte nicht geladen werden (${response.status})`);
  return response.json();
}

export async function createLobbyGame(baseUrl, { sessionId, name, seed, mode }) {
  const response = await fetch(`${baseUrl}/vnext/lobby/games`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, name, seed, mode })
  });
  if (!response.ok) throw new Error(`Lobby-Spiel konnte nicht erstellt werden (${response.status})`);
  return response.json();
}

export async function joinLobbyGame(baseUrl, gameId, { sessionId }) {
  const response = await fetch(`${baseUrl}/vnext/lobby/games/${encodeURIComponent(gameId)}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });
  if (!response.ok) throw new Error(`Lobby-Spiel konnte nicht betreten werden (${response.status})`);
  return response.json();
}

export async function restartMatch(baseUrl, matchId, seed, mode) {
  const response = await fetch(`${baseUrl}/vnext/matches/${encodeURIComponent(matchId)}/restart`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed, mode })
  });
  if (!response.ok) throw new Error(`Restart fehlgeschlagen (${response.status})`);
  return response.json();
}

export async function startBot(baseUrl, matchId, { clientId = 'p2', speed = 'normal', maxActions = 1000 } = {}) {
  const response = await fetch(`${baseUrl}/vnext/matches/${encodeURIComponent(matchId)}/bot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, speed, maxActions })
  });
  if (!response.ok) throw new Error(`Bot-Start fehlgeschlagen (${response.status})`);
  return response.json();
}

export async function stopBot(baseUrl, matchId, clientId = 'p2') {
  const response = await fetch(`${baseUrl}/vnext/matches/${encodeURIComponent(matchId)}/bot?clientId=${encodeURIComponent(clientId)}`, {
    method: 'DELETE'
  });
  if (!response.ok && response.status !== 404) throw new Error(`Bot-Stop fehlgeschlagen (${response.status})`);
  return response.ok;
}

export async function stopBots(baseUrl, matchId) {
  const results = await Promise.all([
    stopBot(baseUrl, matchId, 'p1'),
    stopBot(baseUrl, matchId, 'p2')
  ]);
  return results.some(Boolean);
}
