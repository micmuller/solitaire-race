import { ProtocolClient, createMatch } from './protocol-client.mjs';
import { foundationIntent, tableauIntent, tableauSelection, wasteSelection } from './intent-mapping.mjs';

const $ = (selector) => document.querySelector(selector);
const SUIT = { C: '♣', D: '♦', H: '♥', S: '♠' };
const RANK = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const baseUrl = window.location.origin;
let client = null;
let selection = null;
let interactionLocked = false;

function setMessage(text, tone = '') {
  $('#message').textContent = text;
  $('#message').dataset.tone = tone;
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

function renderStack(container, cards, { compact = false, tableau = false, onCardClick } = {}) {
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
    container.append(element);
  });
}

function renderTableau(container, tableau, owner, compact = false) {
  container.replaceChildren();
  tableau.forEach((cards, index) => {
    const pile = document.createElement('div');
    pile.className = 'tableau-pile card-slot';
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
        : null
    });
    container.append(pile);
  });
}

function render(current) {
  const { state, rev, stateHash } = current;
  const localId = client.clientId;
  const opponentId = localId === 'p1' ? 'p2' : 'p1';
  const local = state.players[localId];
  const opponent = state.players[opponentId];
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
    }
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
}

function setSelection(nextSelection) {
  selection = nextSelection;
  $('#selection-label').hidden = !selection;
  $('#cancel-selection').hidden = !selection;
  $('#selection-label').textContent = selection ? `${selection.count} Karte${selection.count === 1 ? '' : 'n'} ausgewählt` : '';
  if (client?.current) render(client.current);
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
  $('#pending').hidden = false;
  try {
    const response = await client.sendIntent(kind, payload);
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

async function connectToMatch() {
  const matchId = $('#match-id').value.trim();
  const clientId = $('#client-id').value;
  if (!matchId) return setMessage('Match-ID fehlt.', 'error');
  client?.close();
  selection = null;
  client = new ProtocolClient({ baseUrl, matchId, clientId });
  client.subscribe((event) => {
    if (event.type === 'state') render(event.current);
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
  setMessage(`Match ${matchId.slice(0, 18)} aktiv`, 'ok');
}

$('#create-match').addEventListener('click', async () => {
  try {
    const match = await createMatch(baseUrl, $('#seed').value.trim(), $('#mode').value);
    $('#match-id').value = match.matchId;
    $('#client-id').value = 'p1';
    await connectToMatch();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

$('#connect-match').addEventListener('click', () => connectToMatch().catch((error) => setMessage(error.message, 'error')));
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
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && selection) setSelection(null);
});
