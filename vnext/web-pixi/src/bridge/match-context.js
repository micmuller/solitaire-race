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

export function resignDecision({ endedReason, role, hasLobbySession = false } = {}) {
  if (endedReason !== 'resign' || !hasLobbySession) return 'generic';
  return role === 'p1' ? 'host-choice' : role === 'p2' ? 'guest-wait' : 'generic';
}

export function resignResultCopy({ state, names, decision } = {}) {
  const winnerName = names?.[state?.winner] || 'Gewinner';
  const resignedName = names?.[state?.endedBy] || 'Ein Spieler';
  const score = `${names?.p1 || 'Spieler 1'} ${state?.players?.p1?.score ?? 0} · ${names?.p2 || 'Spieler 2'} ${state?.players?.p2?.score ?? 0}`;
  const followUp = decision === 'host-choice'
    ? 'Mit neuem Seed weiterspielen?'
    : decision === 'guest-wait'
      ? 'P1 entscheidet über Neustart oder Lobby.'
      : '';
  return {
    title: `${winnerName} gewinnt!`,
    text: `${resignedName} hat aufgegeben. Spielstand: ${score}.${followUp ? ` ${followUp}` : ''}`,
  };
}

export function seedForHostedGame({ requestedSeed = '', technical = false, generateSeed } = {}) {
  if (technical && typeof requestedSeed === 'string' && requestedSeed.trim()) return requestedSeed.trim();
  if (typeof generateSeed !== 'function') throw new TypeError('generateSeed is required');
  return generateSeed();
}
