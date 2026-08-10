import { ProtocolClient, createMatch, restartMatch, startBot, stopBots } from './protocol-client.mjs';
import { cueForIntentResult } from './effects.mjs';
import { autoFoundationIntent, dragSelection, dropIntent, foundationIntent, tableauIntent, tableauSelection, wasteSelection } from './intent-mapping.mjs';
import { inviteUrl, matchUrl, readLaunchParams } from './lobby.mjs';
import { generateRandomSeed } from './seed.mjs';
import { WEB_CLIENT_VERSION, labelsFromConfig, setVersionMenuOpen, toggleVersionMenu } from './version.mjs';

const $ = (selector) => document.querySelector(selector);
const SUIT = { C: '♣', D: '♦', H: '♥', S: '♠' };
const RANK = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const ACTION_PLAYER_IDS = new Set(['p1', 'p2']);
const ROLE_LABELS = { p1: 'P1', p2: 'P2', observer: 'Observer' };
const MODE_LABELS = { split: 'Split', shared: 'Shared' };
const GAME_OVER_DIALOG_DELAY_MS = 10000;
const CELEBRATION_DURATION_MS = 10500;
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
let activeBotMatchId = null;
let currentMatchKind = 'human';
let celebratedMatchKey = null;
let gameOverDialogTimer = null;

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

function setAppMenuOpen(isOpen) {
  $('#app-menu').hidden = !isOpen;
  $('#app-menu-toggle').setAttribute('aria-expanded', String(isOpen));
}

function toggleAppMenu() {
  setAppMenuOpen($('#app-menu').hidden);
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
}

function clearGameOverFlow() {
  if (gameOverDialogTimer) {
    window.clearTimeout(gameOverDialogTimer);
    gameOverDialogTimer = null;
  }
  closeDialog($('#game-over-dialog'));
}

function updateHeaderSummary() {
  const seed = $('#seed').value.trim();
  const mode = $('#mode').value;
  const role = client?.clientId || $('#client-id').value;
  $('#summary-seed').textContent = seed || '-';
  $('#summary-mode').textContent = MODE_LABELS[mode] || mode || '-';
  $('#summary-role').textContent = ROLE_LABELS[role] || role || '-';
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
  updateHeaderSummary();
}

function canRestartCurrentMatch() {
  return client?.clientId === 'p1' || (client?.clientId === 'observer' && currentMatchKind === 'bot-versus');
}

function isP2User() {
  return (client?.clientId || $('#client-id').value) === 'p2';
}

function isMatchFinished() {
  return client?.current?.state?.status === 'finished';
}

function canSendActions() {
  return ACTION_PLAYER_IDS.has(client?.clientId) && !isMatchFinished();
}

function localDisplayId() {
  return ACTION_PLAYER_IDS.has(client?.clientId) ? client.clientId : 'p1';
}

function updateRestartControl() {
  const canRestart = canRestartCurrentMatch();
  $('#restart-match').disabled = !canRestart;
  $('#restart-match').title = canRestart ? 'Match neu starten' : 'Nur P1 kann den Match neu starten';
}

function updateBotControls() {
  $('#stop-bot-match').disabled = (!activeBotMatchId && client?.clientId !== 'p1') || isP2User();
}

function updateActionControls() {
  const hostLocked = isP2User();
  $('#create-match').disabled = hostLocked;
  $('#create-bot-match').disabled = hostLocked;
  $('#create-bot-versus-match').disabled = hostLocked;
  $('#random-seed').disabled = hostLocked;
  $('#seed').disabled = hostLocked;
  $('#mode').disabled = hostLocked;
  $('#bot-speed').disabled = hostLocked;
  $('#resign-match').disabled = client?.clientId !== 'p2' || isMatchFinished();
  updateRestartControl();
  updateBotControls();
}

async function stopActiveBot({ quiet = false } = {}) {
  const matchId = activeBotMatchId || (client?.clientId === 'p1' ? client.matchId : null);
  if (!matchId) return false;
  if (activeBotMatchId === matchId) activeBotMatchId = null;
  updateBotControls();
  try {
    const stopped = await stopBots(baseUrl, matchId);
    if (!quiet) setMessage(stopped ? 'Bot gestoppt.' : 'Kein Bot aktiv.', stopped ? 'ok' : 'warn');
    return stopped;
  } catch (error) {
    if (!quiet) setMessage(error.message, 'error');
    return false;
  }
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
  updateHeaderSummary();
}

function gameOverMessage(state) {
  if (state?.status !== 'finished') return null;
  if (state.endedReason === 'resign') {
    return `${ROLE_LABELS[state.endedBy] || state.endedBy} hat aufgegeben. Sieger: ${ROLE_LABELS[state.winner] || state.winner}.`;
  }
  if (state.endedReason === 'completed') {
    return `${ROLE_LABELS[state.winner] || state.winner} hat alle eigenen Karten abgelegt.`;
  }
  return `Match beendet. Sieger: ${ROLE_LABELS[state.winner] || state.winner || '-'}.`;
}

function scoreLine(state) {
  return `P1 ${state.players.p1.score} : ${state.players.p2.score} P2`;
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

function renderStack(container, cards, { compact = false, tableau = false, onCardClick, onCardDoubleClick, onCardPointerDown } = {}) {
  container.replaceChildren();
  cards.forEach((card, index) => {
    const element = cardElement(card, compact);
    if (tableau) element.style.setProperty('--stack-index', index);
    let clickTimer = null;
    if (onCardClick) {
      element.classList.add('interactive');
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        if (onCardDoubleClick) {
          window.clearTimeout(clickTimer);
          if (event.detail > 1) return;
          clickTimer = window.setTimeout(() => {
            clickTimer = null;
            onCardClick(card, index);
          }, 260);
          return;
        }
        onCardClick(card, index);
      });
    }
    if (onCardDoubleClick) {
      element.classList.add('interactive');
      element.addEventListener('dblclick', (event) => {
        event.stopPropagation();
        event.preventDefault();
        window.clearTimeout(clickTimer);
        clickTimer = null;
        onCardDoubleClick(card, index);
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
    const stackStep = tableauStackStep(cards.length, compact);
    pile.style.setProperty('--stack-step', `${stackStep}px`);
    pile.style.setProperty('--stack-span', `${Math.max(0, cards.length - 1) * stackStep}px`);
    if (selection && owner === client.clientId && canSendActions()) pile.classList.add('targetable');
    pile.addEventListener('click', () => {
      if (!selection || owner !== client.clientId || interactionLocked || !canSendActions()) return;
      moveToTableau(index);
    });
    renderStack(pile, cards, {
      compact,
      tableau: true,
      onCardClick: owner === client.clientId
        ? (card, cardIndex) => handleTableauCard(cards, index, card, cardIndex)
        : null,
      onCardDoubleClick: owner === client.clientId
        ? (card, cardIndex) => autoMoveTableauCardToFoundation(cards, index, card, cardIndex)
        : null,
      onCardPointerDown: owner === client.clientId
        ? (event, card, cardIndex) => startDrag(event, { zone: 'tableau', index, cardIndex, cards }, card)
        : null
    });
    container.append(pile);
  });
}

function tableauStackStep(cardCount, compact) {
  const landscape = window.innerWidth > window.innerHeight;
  const normalStep = landscape ? (compact ? 11 : 21) : (compact ? 13 : 24);
  if (cardCount <= 1) return normalStep;
  const maximumSpan = landscape
    ? window.innerHeight * (compact ? 0.12 : 0.22)
    : window.innerHeight * (compact ? 0.16 : 0.28);
  const minimumStep = compact ? 7 : 10;
  return Math.max(minimumStep, Math.min(normalStep, maximumSpan / (cardCount - 1)));
}

function render(current, { animate = false } = {}) {
  const previousRects = animate ? captureCardRects() : null;
  const { state, rev, stateHash } = current;
  if (state.status === 'finished') selection = null;
  const localId = localDisplayId();
  const opponentId = localId === 'p1' ? 'p2' : 'p1';
  const local = state.players[localId];
  const opponent = state.players[opponentId];
  syncSetupFields(state);
  updateActionControls();
  $('#revision').textContent = `rev ${rev}`;
  $('#state-hash').textContent = `hash ${stateHash.slice(0, 12)}`;
  $('#local-id').textContent = localId.toUpperCase();
  $('#opponent-id').textContent = opponentId.toUpperCase();
  $('#local-score').textContent = String(local.score);
  $('#opponent-score').textContent = String(opponent.score);
  $('#local-stock').replaceChildren();
  $('#local-stock').classList.remove('empty');
  if (local.stock.length) $('#local-stock').append(cardElement(local.stock.at(-1)));
  else $('#local-stock').classList.add('empty');
  renderStack($('#local-waste'), local.waste.length ? [local.waste.at(-1)] : [], {
    onCardClick: () => {
      if (!interactionLocked && canSendActions()) setSelection(wasteSelection(localId, local.waste));
    },
    onCardDoubleClick: (card) => autoMoveWasteToFoundation(localId, local.waste, card),
    onCardPointerDown: canSendActions()
      ? (event, card) => startDrag(event, { zone: 'waste', cards: local.waste }, card)
      : null
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
    if (selection && canSendActions()) slot.classList.add('targetable');
    slot.addEventListener('click', () => {
      if (!selection || interactionLocked || !canSendActions()) return;
      moveToFoundation(index);
    });
    if (foundation.cards.length) slot.append(cardElement(foundation.cards.at(-1)));
    foundationCount += foundation.cards.length;
    foundations.append(slot);
  });
  $('#foundation-count').textContent = `${foundationCount} / 104`;
  const ended = gameOverMessage(state);
  if (ended) {
    setMessage(`${ended} ${scoreLine(state)}`, 'warn');
    showGameOverDialog(current);
  }
  if (previousRects) animateAuthoritativeChanges(previousRects);
}

function showGameOverDialog(current, { preview = false } = {}) {
  const { state, rev, stateHash } = current;
  if (state.status !== 'finished' || state.endedReason !== 'completed') return;
  const key = preview ? `preview:${Date.now()}` : `${client?.matchId || state.seed}:${rev}:${stateHash}`;
  if (celebratedMatchKey === key) return;
  celebratedMatchKey = key;
  if (gameOverDialogTimer) window.clearTimeout(gameOverDialogTimer);
  closeDialog($('#game-over-dialog'));
  closeDialog($('#restart-dialog'));
  launchCelebration();
  gameOverDialogTimer = window.setTimeout(() => {
    gameOverDialogTimer = null;
    $('#game-over-title').textContent = `${ROLE_LABELS[state.winner] || state.winner} gewinnt`;
    $('#game-over-summary').textContent = `${ROLE_LABELS[state.winner] || state.winner} hat alle eigenen Karten abgelegt. Endstand ${scoreLine(state)}. Neues Spiel?`;
    $('#game-over-p1-score').textContent = String(state.players.p1.score);
    $('#game-over-p2-score').textContent = String(state.players.p2.score);
    const canStartNew = !preview && canRestartCurrentMatch();
    $('#game-over-new').disabled = !canStartNew;
    $('#game-over-new').title = canStartNew ? 'Neues Spiel starten' : preview ? 'Finalsequenz-Test startet keinen Match' : 'P1 startet den nächsten Match';
    if (!$('#game-over-dialog').open) $('#game-over-dialog').showModal();
  }, GAME_OVER_DIALOG_DELAY_MS);
}

function launchCelebration() {
  const layer = document.createElement('div');
  layer.className = 'celebration-layer';
  const colors = ['#f6d77d', '#72d5a0', '#e06b63', '#7fb4ff', '#f4f2ec', '#ff9f7a'];
  for (let index = 0; index < 260; index += 1) {
    const piece = document.createElement('span');
    piece.style.setProperty('--x', `${Math.random() * 100}vw`);
    piece.style.setProperty('--dx', `${Math.random() * 140 - 70}px`);
    piece.style.setProperty('--delay', `${Math.random() * 7600}ms`);
    piece.style.setProperty('--color', colors[index % colors.length]);
    piece.style.setProperty('--rotate', `${Math.random() * 900 - 450}deg`);
    layer.append(piece);
  }
  document.body.append(layer);
  window.setTimeout(() => layer.remove(), CELEBRATION_DURATION_MS);
}

function previewFinalSequence() {
  const baseState = client?.current?.state;
  const state = structuredClone(baseState || {
    seed: $('#seed').value.trim() || 'FINAL-SEQUENCE-PREVIEW',
    status: 'active',
    endedReason: null,
    winner: null,
    endedBy: null,
    players: {
      p1: { score: 0 },
      p2: { score: 0 }
    }
  });
  const winner = client?.clientId === 'p2' ? 'p2' : 'p1';
  state.status = 'finished';
  state.endedReason = 'completed';
  state.winner = winner;
  state.endedBy = winner;
  state.players.p1.score ??= 0;
  state.players.p2.score ??= 0;
  showGameOverDialog({
    rev: client?.current?.rev ?? 0,
    stateHash: client?.current?.stateHash ?? 'preview',
    state
  }, { preview: true });
  setAppMenuOpen(false);
  setMessage('Finalsequenz-Test abgespielt.', 'ok');
}

async function startNextGame() {
  closeDialog($('#game-over-dialog'));
  if (!canRestartCurrentMatch()) {
    setMessage('Neues Spiel kann nur P1 starten.', 'warn');
    return;
  }
  $('#restart-dialog').showModal();
}

function animateAuthoritativeChanges(previousRects) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const animated = [];
  const glowingFoundations = new Set();
  document.querySelectorAll('.playing-card[data-card-id]').forEach((element) => {
    const previous = previousRects.get(element.dataset.cardId);
    const current = element.getBoundingClientRect();
    const foundationSlot = element.closest('.foundation-slot');
    if (!previous) {
      element.classList.add('card-arrived');
      animated.push(element);
      if (foundationSlot) glowingFoundations.add(foundationSlot);
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
    if (foundationSlot) glowingFoundations.add(foundationSlot);
  });
  glowingFoundations.forEach((element) => element.classList.add('foundation-glow'));
  window.setTimeout(() => {
    animated.forEach((element) => element.classList.remove('card-arrived'));
  }, 260);
  window.setTimeout(() => {
    glowingFoundations.forEach((element) => element.classList.remove('foundation-glow'));
  }, 720);
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
  if (interactionLocked || !canSendActions()) return;
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

function autoMoveWasteToFoundation(owner, cards, card) {
  if (interactionLocked || !canSendActions()) return;
  const nextSelection = wasteSelection(owner, cards);
  autoMoveSelectionToFoundation(nextSelection, card);
}

function autoMoveTableauCardToFoundation(cards, pileIndex, card, cardIndex) {
  if (interactionLocked || !canSendActions() || card.faceDown || cardIndex !== cards.length - 1) return;
  const nextSelection = tableauSelection(client.clientId, pileIndex, cardIndex, cards);
  autoMoveSelectionToFoundation(nextSelection, card);
}

function autoMoveSelectionToFoundation(nextSelection, card) {
  const intent = autoFoundationIntent(nextSelection, client.current?.state?.foundations, card);
  if (intent) sendIntent(intent.kind, intent.payload);
  else setMessage('Keine passende Foundation fuer diese Karte.', 'warn');
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
  if (!canSendActions()) {
    setMessage(isMatchFinished() ? 'Match ist beendet.' : 'Diese Aktion ist fuer diese Rolle nicht verfuegbar.', 'warn');
    return null;
  }
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
    } else if (kind === 'resign') {
      selection = null;
      setMessage('Du hast aufgegeben.', 'warn');
    } else {
      selection = null;
      setMessage(`${kind} akzeptiert`, 'ok');
    }
  } catch (error) {
    setMessage(error.message, 'error');
  } finally {
    interactionLocked = false;
    $('#pending').hidden = true;
    if (client?.current) setSelection(selection, { rerender: false });
  }
}

function startDrag(event, source, card) {
  if (interactionLocked || event.button !== 0 || !canSendActions()) return;
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
    card,
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
  setSelection(drag.selection, { rerender: false });
  setDragTargetsActive(true);
  drag.ghost = document.createElement('div');
  drag.ghost.className = 'drag-ghost';
  const ghostCard = cardElement(drag.card);
  ghostCard.classList.remove('selected');
  ghostCard.classList.add('drag-ghost-card');
  drag.ghost.append(ghostCard);
  if (drag.selection.count > 1) {
    const count = document.createElement('span');
    count.className = 'drag-ghost-count';
    count.textContent = `+${drag.selection.count - 1}`;
    drag.ghost.append(count);
  }
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
  setDragTargetsActive(false);
}

function setDragTargetsActive(active) {
  document.querySelectorAll('#local-tableau [data-drop-zone="tableau"], #foundations [data-drop-zone="foundation"]').forEach((element) => {
    element.classList.toggle('targetable', active);
  });
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
  await stopActiveBot({ quiet: true });
  const matchId = $('#match-id').value.trim();
  const clientId = $('#client-id').value;
  if (!matchId) return setMessage('Match-ID fehlt.', 'error');
  client?.close();
  selection = null;
  celebratedMatchKey = null;
  clearGameOverFlow();
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
  updateHeaderSummary();
  updateActionControls();
  setRoute(matchId, clientId);
  setInvite(matchId, clientId === 'p1');
  setMessage(`Match ${matchId.slice(0, 18)} aktiv`, 'ok');
}

async function startHostMatch({ randomSeed = false, withBot = false } = {}) {
  try {
    if (isP2User()) {
      setMessage('P2 kann keinen neuen Match starten.', 'warn');
      return;
    }
    await configReady;
    await stopActiveBot({ quiet: true });
    if (randomSeed) setRandomSeed();
    const seed = $('#seed').value.trim() || generateRandomSeed();
    $('#seed').value = seed;
    const match = await createMatch(baseUrl, seed, $('#mode').value);
    currentMatchKind = withBot ? 'human-bot' : 'human';
    $('#match-id').value = match.matchId;
    $('#client-id').value = 'p1';
    setRoute(match.matchId, 'p1');
    setInvite(match.matchId, !withBot);
    await connectToMatch();
    if (withBot) {
      await startBot(baseUrl, match.matchId, { clientId: 'p2', speed: $('#bot-speed').value, maxActions: 1000 });
      activeBotMatchId = match.matchId;
      updateBotControls();
      setInvite(match.matchId, false);
      setMessage(`Match ${match.matchId.slice(0, 18)} mit Bot aktiv`, 'ok');
    }
  } catch (error) {
    setMessage(error.message, 'error');
  }
}

async function startBotVersusMatch({ randomSeed = false } = {}) {
  try {
    if (isP2User()) {
      setMessage('P2 kann keinen Bot-vs-Bot-Match starten.', 'warn');
      return;
    }
    await configReady;
    await stopActiveBot({ quiet: true });
    if (randomSeed) setRandomSeed();
    const seed = $('#seed').value.trim() || generateRandomSeed();
    $('#seed').value = seed;
    const match = await createMatch(baseUrl, seed, $('#mode').value);
    currentMatchKind = 'bot-versus';
    $('#match-id').value = match.matchId;
    $('#client-id').value = 'observer';
    setRoute(match.matchId, 'observer');
    setInvite(match.matchId, false);
    await connectToMatch();
    await Promise.all([
      startBot(baseUrl, match.matchId, { clientId: 'p1', speed: $('#bot-speed').value, maxActions: 1000 }),
      startBot(baseUrl, match.matchId, { clientId: 'p2', speed: $('#bot-speed').value, maxActions: 1000 })
    ]);
    activeBotMatchId = match.matchId;
    updateBotControls();
    setMessage(`Bot-vs-Bot ${match.matchId.slice(0, 18)} aktiv`, 'ok');
  } catch (error) {
    setMessage(error.message, 'error');
  }
}

async function restartHostMatch({ randomSeed = false } = {}) {
  if (!canRestartCurrentMatch()) {
    setMessage('Restart ist nur fuer P1 verfuegbar.', 'warn');
    return;
  }
  try {
    await stopActiveBot({ quiet: true });
    interactionLocked = true;
    $('#pending').hidden = false;
    clearGameOverFlow();
    if (randomSeed) setRandomSeed();
    const seed = $('#seed').value.trim() || generateRandomSeed();
    $('#seed').value = seed;
    const response = await restartMatch(baseUrl, client.matchId, seed, $('#mode').value);
    celebratedMatchKey = null;
    client.handle(response);
    if (currentMatchKind === 'human-bot') {
      await startBot(baseUrl, client.matchId, { clientId: 'p2', speed: $('#bot-speed').value, maxActions: 1000 });
      activeBotMatchId = client.matchId;
      setInvite(client.matchId, false);
    } else if (currentMatchKind === 'bot-versus') {
      await Promise.all([
        startBot(baseUrl, client.matchId, { clientId: 'p1', speed: $('#bot-speed').value, maxActions: 1000 }),
        startBot(baseUrl, client.matchId, { clientId: 'p2', speed: $('#bot-speed').value, maxActions: 1000 })
      ]);
      activeBotMatchId = client.matchId;
      setInvite(client.matchId, false);
    } else {
      setInvite(client.matchId, true);
    }
    updateBotControls();
    setMessage(`Match neu gestartet: ${response.reason}`, 'ok');
  } catch (error) {
    setMessage(error.message, 'error');
  } finally {
    interactionLocked = false;
    $('#pending').hidden = true;
  }
}

function resignMatch() {
  if (client?.clientId !== 'p2') {
    setMessage('Aufgeben ist aktuell nur fuer P2 verfuegbar.', 'warn');
    return;
  }
  if (isMatchFinished()) {
    setMessage('Match ist bereits beendet.', 'warn');
    return;
  }
  if (!window.confirm('Match aufgeben?')) return;
  sendIntent('resign', {});
}

$('#random-seed').addEventListener('click', () => setRandomSeed());
$('#seed').addEventListener('input', () => updateHeaderSummary());
$('#mode').addEventListener('change', () => {
  updateHeaderSummary();
  updateActionControls();
});
$('#client-id').addEventListener('change', () => {
  updateHeaderSummary();
  updateActionControls();
});
$('#create-match').addEventListener('click', () => startHostMatch());
$('#create-bot-match').addEventListener('click', () => startHostMatch({ withBot: true }));
$('#create-bot-versus-match').addEventListener('click', () => startBotVersusMatch());
$('#stop-bot-match').addEventListener('click', () => stopActiveBot());
$('#resign-match').addEventListener('click', () => resignMatch());
$('#preview-final-sequence').addEventListener('click', () => previewFinalSequence());
$('#app-menu-toggle').addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  toggleAppMenu();
});
$('#restart-match').addEventListener('click', () => {
  if (!canRestartCurrentMatch()) {
    updateRestartControl();
    setMessage('Restart ist nur fuer P1 verfuegbar.', 'warn');
    return;
  }
  $('#restart-dialog').showModal();
});
$('#restart-same-seed').addEventListener('click', () => {
  $('#restart-dialog').close();
  restartHostMatch();
});
$('#restart-new-seed').addEventListener('click', () => {
  $('#restart-dialog').close();
  restartHostMatch({ randomSeed: true });
});
$('#restart-cancel').addEventListener('click', () => $('#restart-dialog').close());
$('#game-over-new').addEventListener('click', () => startNextGame().catch((error) => setMessage(error.message, 'error')));
$('#game-over-close').addEventListener('click', () => $('#game-over-dialog').close());

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
  if (!client?.current || !canSendActions()) return;
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
document.addEventListener('click', (event) => {
  if (event.target.closest('#app-menu-toggle') || event.target.closest('#app-menu')) return;
  setAppMenuOpen(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && selection) setSelection(null);
  if (event.key === 'Escape') {
    setVersionMenuOpen($('#version-menu'), $('#version-badge'), false);
    setAppMenuOpen(false);
  }
});

let resizeFrame = null;
window.addEventListener('resize', () => {
  if (!client?.current || resizeFrame !== null) return;
  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = null;
    render(client.current);
  });
});

const launch = readLaunchParams(window.location.search);
if (launch) {
  $('#match-id').value = launch.matchId;
  $('#client-id').value = launch.role;
  setInvite(launch.matchId, launch.role === 'p1');
  connectToMatch().catch((error) => setMessage(error.message, 'error'));
}

updateBotControls();
updateHeaderSummary();
updateActionControls();
