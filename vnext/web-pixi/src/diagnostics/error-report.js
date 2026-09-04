function printable(value, fallback = '–') {
  return value === undefined || value === null || value === '' ? fallback : String(value);
}

export function describeOpponent({ activeKind = 'human', activeGame = null, role = null } = {}) {
  const opponentRole = role === 'p1' ? 'p2' : role === 'p2' ? 'p1' : null;
  const opponent = opponentRole ? activeGame?.players?.[opponentRole] : null;
  if (opponent?.nickname) return `${opponent.nickname} (${opponentRole.toUpperCase()})`;
  if (activeGame?.status === 'waiting') return 'Noch nicht verbunden';
  if (activeGame) return 'Human';
  if (activeKind === 'bot-versus') return 'Bot P1 vs Bot P2';
  if (activeKind === 'bot') return role === 'p1' ? 'Bot (P2)' : 'Human vs Bot';
  return 'Unbekannt';
}

export function buildErrorReport({
  version,
  protocolVersion,
  client,
  activeKind,
  activeGame,
  baseUrl,
  rendererDiagnostics = null,
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
    `Renderer: ${rendererDiagnostics ? `${printable(rendererDiagnostics.rendererName)} · Ticker ${rendererDiagnostics.tickerStarted?'aktiv':'gestoppt'} · FPS-Limit ${rendererDiagnostics.tickerMaxFps||'aus'} · Karten ${printable(rendererDiagnostics.cardRedraws)} · Slots ${printable(rendererDiagnostics.slotRebuilds)} · Kontextverluste ${printable(rendererDiagnostics.contextLosses,0)}` : '–'}`,
    `Browser: ${printable(userAgent)}`,
    '',
    'Letzte lokale Ereignisse:'
  ];
  if (debugLines.length) lines.push(...debugLines);
  else lines.push('– keine lokalen Ereignisse aufgezeichnet –');
  return lines.join('\n');
}

export async function copyDiagnosticText(text, options = {}) {
  const documentRef=options.documentRef ?? (typeof document === 'undefined' ? null : document);
  const clipboard=options.clipboard ?? (typeof navigator === 'undefined' ? null : navigator.clipboard);
  if(documentRef?.body&&typeof documentRef.createElement==='function'&&typeof documentRef.execCommand==='function'){
    const field=documentRef.createElement('textarea');
    field.value=text; field.readOnly=true; field.setAttribute?.('aria-hidden','true');
    Object.assign(field.style,{position:'fixed',left:'-9999px',top:'0',opacity:'0',pointerEvents:'none'});
    documentRef.body.append(field);
    try{
      field.focus(); field.select(); field.setSelectionRange?.(0,text.length);
      if(documentRef.execCommand('copy'))return 'legacy';
    }finally{field.remove();}
  }
  if(typeof clipboard?.writeText==='function'){
    await clipboard.writeText(text);
    return 'clipboard';
  }
  throw new Error('Clipboard unavailable');
}
