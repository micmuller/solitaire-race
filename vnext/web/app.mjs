import { ProtocolClient, createMatch } from './protocol-client.mjs';
import { cueForIntentResult } from './effects.mjs';
import { dragSelection, dropIntent, foundationIntent, tableauIntent, tableauSelection, wasteSelection } from './intent-mapping.mjs';
import { inviteUrl, matchUrl, readLaunchParams } from './lobby.mjs';
import { generateRandomSeed } from './seed.mjs';
import { WEB_CLIENT_VERSION, labelsFromConfig, setVersionMenuOpen, toggleVersionMenu } from './version.mjs';

const $ = (selector) => document.querySelector(selector);
const SUIT = { C: '♣', D: '♦', H: '♥', S: '♠' };
const RANK = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const baseUrl = window.location.origin;
let client = null;
let selection = null;
let interactionLocked = false;
let drag = null;
let suppressNextClick = false;
let audioContext = null;
let publicBaseUrl = baseUrl;
let serverVersion = '-';
let serverProtocolVersion = '-';

const configReady = loadConfig();
setRandomSeed();
setVersionLabels();

async function loadConfig() {
  try {
    const response = await fetch(`${baseUrl}/vnext/config`);
    if (!response.ok) return;
    const config = await response.json();
    const labels = labelsFromConfig(config);
    serverVersion = labels.serverVersion;
    serverProtocolVersion = labels.protocolVersion;
    if (typeof config.publicBaseUrl === 'string' && config.publicBaseUrl) {
      publicBaseUrl = config.publicBaseUrl.replace(/\/$/, '');
    }
  } catch {
    publicBaseUrl = baseUrl;
  } finally {
    setVersionLabels();
  }
}

function setVersionLabels() {
  $('#version-badge').textContent = WEB_CLIENT_VERSION;
  $('#server-version').textContent = serverVersion;
  $('#protocol-version').textContent = serverProtocolVersion;
  $('#web-version').textContent = WEB_CLIENT_VERSION;
}

function setMessage(text, tone = '') {
  $('#message').textContent = text;
  $('#message').dataset.tone = tone;
}

function currentPath() {
  return `${window.location.pathname.replace(/\/$/, '')}/`;
}

function setRoute(matchId, role) {
  const url = matchUrl({ origin: baseUrl, pathname: currentPath(), matchId, role });
  if (url) window.history.replaceState({}, '', url);
}

function setInvite(matchId, visible = true) {
  const link = inviteUrl({ origin: publicBaseUrl, pathname: currentPath(), matchId });
  $('#invite-link').value = link;
  $('#invite-panel').hidden = !link || !visible;
}

function setRandomSeed() {
  $('#seed').value = generateRandomSeed();
}

async function copyText(text, input) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  input.focus();
  input.select();
  input.setSelectionRange(0, text.length);
  return document.execCommand?.('copy') === true;
}

function syncSetupFields(state) {
  if (state?.seed) $('#seed').value = state.seed;
  if (state?.mode) $('#mode').value = state.mode;
}

function captureCardRects() {
  const rects = new Map();
  document.querySelectorAll('.playing-card[data-card-id]').forEach((element) => {
    rects.set(element.dataset.cardId, element.getBoundingClientRect());
  });
  return rects;
}

function cardElement(card, compact = false) {
  const element = document.createElement('div');
  element.className = `playing-card${card.faceDown ? ' face-down' : ''}${compact ? ' compact-card' : ''}`;
  element.dataset.cardId = card.cardId;
  if (!card.faceDown) {
    const rank = RANK[card.rank] || String(card.rank);
    const suit = SUIT[card.suit];
    element.classList.add(card.suit === 'D' || card.suit === 'H' ? 'red' : 'black');
    element.innerHTML = `<span class="corner top">${rank}<small>${suit}</small></span><strong>${suit}</strong><span class="corner bottom">${rank}<small>${suit}</small></span>`;
  }
  if (selection?.cardIds.includes(card.cardId)) element.classList.add('selected');
  return element;
}

function renderStack(container, cards, { compact = false, tableau = false, onCardClick, onCardPointerDown } = {}) {
  container.replaceChildren();
  cards.forEach((card, index) => {
    const element = cardElement(card, compact);
    if (tableau) element.style.setProperty('--stack-index', index);
    if (onCardClick) {
      element.classList.add('interactive');
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        onCardClick(card, index);
      });
    }
    if (onCardPointerDown) {
      element.classList.add('draggable-card');
      element.addEventListener('pointerdown', (event) => onCardPointerDown(event, card, index));
    }
    container.append(element);
  });
}

function renderTableau(container, tableau, owner, compact = false) {
  container.replaceChildren();
  tableau.forEach((cards, index) => {
    const pile = document.createElement('div');
    pile.className = 'tableau-pile card-slot';
    pile.dataset.dropZone = 'tableau';
    pile.dataset.dropIndex = String(index);
    if (selection && owner === client.clientId) pile.classList.add('targetable');
    pile.addEventListener('click', () => {
      if (!selection || owner !== client.clientId || interactionLocked) return;
      moveToTableau(index);
    });
    renderStack(pile, cards, {
      compact,
      tableau: true,
      onCardClick: owner === client.clientId
        ? (card, cardIndex) => handleTableauCard(cards, index, card, cardIndex)
        : null,
      onCardPointerDown: owner === client.clientId
        ? (event, card, cardIndex) => startDrag(event, { zone: 'tableau', index, cardIndex, cards }, card)
        : null
    });
    container.append(pile);
  });
}

function render(current, { animate = false } = {}) {
  const previousRects = animate ? captureCardRects() : null;
  const { state, rev, stateHash } = current;
  const localId = client.clientId;
  const opponentId = localId === 'p1' ? 'p2' : 'p1';
  const local = state.players[localId];
  const opponent = state.players[opponentId];
  syncSetupFields(state);
  $('#revision').textContent = `rev ${rev}`;
  $('#state-hash').textContent = `hash ${stateHash.slice(0, 12)}`;
  $('#local-id').textContent = localId.toUpperCase();
  $('#opponent-id').textContent = opponentId.toUpperCase();
  $('#local-stock').replaceChildren();
  $('#local-stock').classList.remove('empty');
  if (local.stock.length) $('#local-stock').append(cardElement(local.stock.at(-1)));
  else $('#local-stock').classList.add('empty');
  renderStack($('#local-waste'), local.waste.length ? [local.waste.at(-1)] : [], {
    onCardClick: () => {
      if (!interactionLocked) setSelection(wasteSelection(localId, local.waste));
    },
    onCardPointerDown: (event, card) => startDrag(event, { zone: 'waste', cards: local.waste }, card)
  });
  renderStack($('#opp-stock'), opponent.stock.length ? [opponent.stock.at(-1)] : [], { compact: true });
  renderStack($('#opp-waste'), opponent.waste.length ? [opponent.waste.at(-1)] : [], { compact: true });
  renderTableau($('#local-tableau'), local.tableau, localId);
  renderTableau($('#opp-tableau'), opponent.tableau, opponentId, true);

  const foundations = $('#foundations');
  foundations.replaceChildren();
  let foundationCount = 0;
  state.foundations.forEach((foundation, index) => {
    const slot = document.createElement('div');
    slot.className = 'card-slot foundation-slot';
    slot.dataset.suit = SUIT[foundation.suit];
    slot.dataset.dropZone = 'foundation';
    slot.dataset.dropIndex = String(index);
    if (selection) slot.classList.add('targetable');
    slot.addEventListener('click', () => {
      if (!selection || interactionLocked) return;
      moveToFoundation(index);
    });
    if (foundation.cards.length) slot.append(cardElement(foundation.cards.at(-1)));
    foundationCount += foundation.cards.length;
    foundations.append(slot);
  });
  $('#foundation-count').textContent = `${foundationCount} / 104`;
  if (previousRects) animateAuthoritativeChanges(previousRects);
}

function animateAuthoritativeChanges(previousRects) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const animated = [];
  document.querySelectorAll('.playing-card[data-card-id]').forEach((element) => {
    const previous = previousRects.get(element.dataset.cardId);
    const current = element.getBoundingClientRect();
    if (!previous) {
      element.classList.add('card-arrived');
      animated.push(element);
      return;
    }
    const dx = previous.left - current.left;
    const dy = previous.top - current.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    if (typeof element.animate !== 'function') return;
    const transform = getComputedStyle(element).transform;
    const baseTransform = transform === 'none' ? '' : transform;
    element.animate([
      { transform: `${baseTransform} translate(${dx}px, ${dy}px)` },
      { transform: baseTransform }
    ], { duration: 180, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    element.classList.add('card-arrived');
    animated.push(element);
  });
  window.setTimeout(() => {
    animated.forEach((element) => element.classList.remove('card-arrived'));
  }, 260);
}

function playCue(cue) {
  if (!cue || (!window.AudioContext && !window.webkitAudioContext)) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  audioContext ??= new AudioContextClass();
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  const now = audioContext.currentTime;
  const master = audioContext.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.045, now + 0.01);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  master.connect(audioContext.destination);

  const tones = {
    draw: [330, 392],
    move: [294, 370],
    foundation: [523, 659, 784],
    invalid: [180, 140],
    sync: [220, 330]
  }[cue] || [300];

  tones.forEach((frequency, index) => {
    const osc = audioContext.createOscillator();
    osc.type = cue === 'invalid' ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(frequency, now + index * 0.035);
    osc.connect(master);
    osc.start(now + index * 0.035);
    osc.stop(now + 0.16 + index * 0.035);
  });
}

function setSelection(nextSelection, { rerender = true } = {}) {
  selection = nextSelection;
  $('#selection-label').hidden = !selection;
  $('#cancel-selection').hidden = !selection;
  $('#selection-label').textContent = selection ? `${selection.count} Karte${selection.count === 1 ? '' : 'n'} ausgewählt` : '';
  if (rerender && client?.current) render(client.current);
}

function handleTableauCard(cards, pileIndex, card, cardIndex) {
  if (interactionLocked) return;
  if (selection) {
    if (selection.source.zone === 'tableau' && selection.source.index === pileIndex) {
      setSelection(null);
      return;
    }
    moveToTableau(pileIndex);
    return;
  }
  if (card.faceDown) {
    if (cardIndex === cards.length - 1) sendIntent('flip', { source: { zone: 'tableau', owner: client.clientId, index: pileIndex } });
    return;
  }
  setSelection(tableauSelection(client.clientId, pileIndex, cardIndex, cards));
}

function moveToTableau(index) {
  const intent = tableauIntent(selection, client.clientId, index);
  if (intent) sendIntent(intent.kind, intent.payload);
}

function moveToFoundation(index) {
  const intent = foundationIntent(selection, index);
  if (intent) sendIntent(intent.kind, intent.payload);
}

async function sendIntent(kind, payload) {
  interactionLocked = true;
  clearDrag();
  $('#pending').hidden = false;
  try {
    const response = await client.sendIntent(kind, payload);
    playCue(cueForIntentResult(kind, response));
    if (response.kind === 'reject') setMessage(`Abgelehnt: ${response.code}. Andere Zielzone wählen.`, 'error');
    else if (response.kind === 'snapshot') {
      selection = null;
      setMessage(`Synchronisiert: ${response.reason}`, 'warn');
    } else {
      selection = null;
      setMessage(`${kind} akzeptiert`, 'ok');
    }
  } catch (error) {
    setMessage(error.message, 'error');
  } finally {
    interactionLocked = false;
    $('#pending').hidden = true;
    if (client?.current) setSelection(selection);
  }
}

function startDrag(event, source, card) {
  if (interactionLocked || event.button !== 0) return;
  const nextSelection = dragSelection(client.clientId, source);
  if (!nextSelection) return;
  drag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    selection: nextSelection,
    source,
    label: cardLabel(card),
    active: false
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function cardLabel(card) {
  const rank = RANK[card.rank] || String(card.rank);
  return `${rank}${SUIT[card.suit]}`;
}

function activateDrag() {
  drag.active = true;
  suppressNextClick = true;
  document.body.classList.add('dragging-card');
  setSelection(drag.selection);
  drag.ghost = document.createElement('div');
  drag.ghost.className = 'drag-ghost';
  drag.ghost.textContent = drag.selection.count === 1 ? drag.label : `${drag.label} +${drag.selection.count - 1}`;
  document.body.append(drag.ghost);
  moveGhost(drag.x, drag.y);
}

function moveGhost(x, y) {
  if (!drag?.ghost) return;
  drag.ghost.style.transform = `translate(${x + 10}px, ${y + 10}px)`;
}

function updateDropHover(x, y) {
  document.querySelectorAll('.drop-hover').forEach((element) => element.classList.remove('drop-hover'));
  const target = document.elementFromPoint(x, y)?.closest('[data-drop-zone]');
  if (target && target.classList.contains('targetable')) target.classList.add('drop-hover');
}

function dropTargetAt(x, y) {
  const element = document.elementFromPoint(x, y)?.closest('[data-drop-zone]');
  if (!element || !element.classList.contains('targetable')) return null;
  return { zone: element.dataset.dropZone, index: Number(element.dataset.dropIndex) };
}

function clearDrag() {
  drag?.ghost?.remove();
  drag = null;
  document.body.classList.remove('dragging-card');
  document.querySelectorAll('.drop-hover').forEach((element) => element.classList.remove('drop-hover'));
}

document.addEventListener('pointermove', (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag.x = event.clientX;
  drag.y = event.clientY;
  const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
  if (!drag.active && distance >= 8) activateDrag();
  if (drag.active) {
    event.preventDefault();
    moveGhost(event.clientX, event.clientY);
    updateDropHover(event.clientX, event.clientY);
  }
});

document.addEventListener('pointerup', (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const activeDrag = drag.active;
  const intent = activeDrag ? dropIntent(drag.selection, client.clientId, dropTargetAt(event.clientX, event.clientY)) : null;
  clearDrag();
  if (intent) sendIntent(intent.kind, intent.payload);
  else if (activeDrag) setSelection(selection);
});

document.addEventListener('pointercancel', (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  clearDrag();
});

async function connectToMatch() {
  await configReady;
  const matchId = $('#match-id').value.trim();
  const clientId = $('#client-id').value;
  if (!matchId) return setMessage('Match-ID fehlt.', 'error');
  client?.close();
  selection = null;
  client = new ProtocolClient({ baseUrl, matchId, clientId });
  client.subscribe((event) => {
    if (event.type === 'state') render(event.current, { animate: event.source === 'ack' });
    if (event.type === 'disconnected') {
      $('#connection-dot').classList.remove('online');
      $('#connection-label').textContent = 'Getrennt';
    }
    if (event.type === 'protocolError') setMessage(event.error.message, 'error');
  });
  setMessage('Verbinde ...');
  await client.connect();
  $('#game').hidden = false;
  $('#connection-dot').classList.add('online');
  $('#connection-label').textContent = `${clientId.toUpperCase()} verbunden`;
  setRoute(matchId, clientId);
  setInvite(matchId, clientId === 'p1');
  setMessage(`Match ${matchId.slice(0, 18)} aktiv`, 'ok');
}

async function startHostMatch({ randomSeed = false } = {}) {
  try {
    await configReady;
    if (randomSeed) setRandomSeed();
    const seed = $('#seed').value.trim() || generateRandomSeed();
    $('#seed').value = seed;
    const match = await createMatch(baseUrl, seed, $('#mode').value);
    $('#match-id').value = match.matchId;
    $('#client-id').value = 'p1';
    setRoute(match.matchId, 'p1');
    setInvite(match.matchId, true);
    await connectToMatch();
  } catch (error) {
    setMessage(error.message, 'error');
  }
}

$('#random-seed').addEventListener('click', () => setRandomSeed());
$('#create-match').addEventListener('click', () => startHostMatch());
$('#restart-match').addEventListener('click', () => $('#restart-dialog').showModal());
$('#restart-same-seed').addEventListener('click', () => {
  $('#restart-dialog').close();
  startHostMatch();
});
$('#restart-new-seed').addEventListener('click', () => {
  $('#restart-dialog').close();
  startHostMatch({ randomSeed: true });
});
$('#restart-cancel').addEventListener('click', () => $('#restart-dialog').close());

$('#connect-match').addEventListener('click', () => connectToMatch().catch((error) => setMessage(error.message, 'error')));
$('#version-badge').addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  const menu = $('#version-menu');
  toggleVersionMenu(menu, $('#version-badge'));
});
$('#copy-invite').addEventListener('click', async () => {
  const input = $('#invite-link');
  const link = input.value;
  if (!link) return;
  try {
    const copied = await copyText(link, input);
    setMessage(copied ? 'Invite-Link kopiert.' : 'Invite-Link ist markiert.', copied ? 'ok' : 'warn');
  } catch {
    input.focus();
    input.select();
    setMessage('Invite-Link ist markiert.', 'warn');
  }
});
$('#local-stock').addEventListener('click', () => {
  if (!client?.current) return;
  if (selection) {
    setSelection(null);
    return;
  }
  const player = client.current.state.players[client.clientId];
  const kind = player.stock.length ? 'draw' : 'recycle';
  const source = { zone: kind === 'draw' ? 'stock' : 'waste', owner: client.clientId };
  const target = { zone: kind === 'draw' ? 'waste' : 'stock', owner: client.clientId };
  sendIntent(kind, { source, target });
});
$('#cancel-selection').addEventListener('click', () => setSelection(null));
document.addEventListener('click', (event) => {
  if (!suppressNextClick) return;
  event.preventDefault();
  event.stopPropagation();
  suppressNextClick = false;
}, true);
document.addEventListener('click', (event) => {
  if (event.target.closest('#version-badge') || event.target.closest('#version-menu')) return;
  setVersionMenuOpen($('#version-menu'), $('#version-badge'), false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && selection) setSelection(null);
  if (event.key === 'Escape') {
    setVersionMenuOpen($('#version-menu'), $('#version-badge'), false);
  }
});

const launch = readLaunchParams(window.location.search);
if (launch) {
  $('#match-id').value = launch.matchId;
  $('#client-id').value = launch.role;
  setInvite(launch.matchId, launch.role === 'p1');
  connectToMatch().catch((error) => setMessage(error.message, 'error'));
}
