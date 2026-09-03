function printable(value, fallback = '–') {
  return value === undefined || value === null || value === '' ? fallback : String(value);
}

export function describeOpponent({ activeKind = 'human', activeGame = null, role = null } = {}) {
  if (activeKind === 'bot-versus') return 'Bot P1 vs Bot P2';
  if (activeKind === 'bot') return role === 'p1' ? 'Bot (P2)' : 'Human vs Bot';
  const opponentRole = role === 'p1' ? 'p2' : role === 'p2' ? 'p1' : null;
  const opponent = opponentRole ? activeGame?.players?.[opponentRole] : null;
  if (opponent?.nickname) return `${opponent.nickname} (${opponentRole.toUpperCase()})`;
  if (activeGame?.status === 'waiting') return 'Noch nicht verbunden';
  return activeGame ? 'Human' : 'Unbekannt';
}

export function buildErrorReport({
  version,
  protocolVersion,
  client,
  activeKind,
  activeGame,
  baseUrl,
  debugLines = [],
  timestamp = new Date().toISOString(),
  userAgent = ''
}) {
  const current = client?.current;
  const state = current?.state;
  const role = client?.clientId;
  const lines = [
    'SOLITAIRE HIGHNOON · FEHLERBERICHT',
    `Zeit: ${printable(timestamp)}`,
    `Pixi Client: ${printable(version)}`,
    `Protokoll: ${printable(protocolVersion)}`,
    `Server: ${printable(baseUrl)}`,
    `Match-ID: ${printable(client?.matchId)}`,
    `Rolle: ${printable(role)}`,
    `Revision: ${printable(current?.rev)}`,
    `State-Hash: ${printable(current?.stateHash)}`,
    `Modus: ${printable(state?.mode)}`,
    `Match-Status: ${printable(state?.status ?? activeGame?.status)}`,
    `Gegner/Bot: ${describeOpponent({ activeKind, activeGame, role })}`,
    `Browser: ${printable(userAgent)}`,
    '',
    'Letzte lokale Ereignisse:'
  ];
  if (debugLines.length) lines.push(...debugLines);
  else lines.push('– keine lokalen Ereignisse aufgezeichnet –');
  return lines.join('\n');
}
