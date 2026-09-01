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
    ? 'Warte auf P2. Öffne den Einladungslink als P2 auf einem zweiten Gerät oder in einem weiteren Tab.'
    : 'P2 muss dem Lobby-Spiel zuerst mit einer eigenen Lobby-Identität beitreten.';
}

export function sameTableauSelection(selection, meta) {
  return selection?.source?.zone === 'tableau'
    && meta?.zone === 'tableau'
    && selection.source.index === meta.pileIndex;
}

export function guestSessionCandidate({ game, persistentSessionId, matchSessionId }) {
  if (matchSessionId) return matchSessionId;
  return game?.players?.p1?.sessionId === persistentSessionId ? null : persistentSessionId || null;
}

export function retryableSequenceReject(response) {
  return response?.kind === 'reject'
    && response.code === 'DUPLICATE_SEQ'
    && Number.isSafeInteger(response.expectedSeq);
}
