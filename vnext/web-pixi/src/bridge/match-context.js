export function gameForMatch(games, matchId) {
  return Array.isArray(games) ? games.find((game) => game?.matchId === matchId) || null : null;
}

export function interactionAllowed({ locked, current, role, lobbyStatus }) {
  return !locked
    && Boolean(current)
    && role !== 'observer'
    && current?.state?.status === 'active'
    && lobbyStatus !== 'waiting';
}

export function waitingMatchMessage(role) {
  return role === 'p1'
    ? 'Warte auf P2. Öffne den Einladungslink auf einem zweiten Gerät oder in einem getrennten Browserprofil.'
    : 'P2 muss dem Lobby-Spiel zuerst mit einer eigenen Lobby-Identität beitreten.';
}
