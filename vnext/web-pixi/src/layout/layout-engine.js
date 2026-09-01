const FOUNDATION_SUITS = Object.freeze(['C', 'C', 'D', 'D', 'H', 'H', 'S', 'S']);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function fanStep({ count, availableSpan, cardHeight, compact = false, faceDownCount = 0 }) {
  if (count <= 1) return 0;
  const naturalOpen = cardHeight * (compact ? 0.17 : 0.205);
  const naturalDown = cardHeight * (compact ? 0.075 : 0.095);
  const required = faceDownCount * naturalDown + Math.max(0, count - 1 - faceDownCount) * naturalOpen;
  const scale = required > availableSpan ? availableSpan / required : 1;
  return {
    faceDown: clamp(naturalDown * scale, compact ? 4 : 6, naturalDown),
    faceUp: clamp(naturalOpen * scale, compact ? 7 : 10, naturalOpen)
  };
}

function packedColumns(width, count, cardWidth, gap, minX, pad) {
  const totalWidth = cardWidth * count + gap * (count - 1);
  const centeredX = (width - totalWidth) / 2;
  const startX = clamp(Math.max(minX, centeredX), pad, width - pad - totalWidth);
  return Array.from({ length: count }, (_, index) => startX + index * (cardWidth + gap));
}

export function computeLayout(width, height, { maxLocalCards = 14, maxOpponentCards = 14 } = {}) {
  if (!(width > 0 && height > 0)) throw new TypeError('viewport must be positive');
  const pad = clamp(Math.min(width, height) * 0.018, 8, 22);
  const contentWidth = width - pad * 2;
  const opponentH = height * 0.275;
  const foundationH = height * 0.19;
  const localH = height - opponentH - foundationH;
  const cardW = clamp(Math.min(contentWidth / 10.75, localH / 3.25), 48, 104);
  const cardH = cardW * 1.42;
  const compactW = cardW * 0.7;
  const compactH = cardH * 0.7;
  const utilityWidth = cardW * 2.22;
  const tableauX = pad + utilityWidth + cardW * 0.28;
  const opponentTableauX = pad + compactW * 2.4 + cardW * 0.35;
  const foundationGap = clamp(cardW * 0.2, 7, 18);
  const localColumns = packedColumns(width, 7, cardW, foundationGap, tableauX, pad);
  const opponentColumns = packedColumns(width, 7, compactW, foundationGap, opponentTableauX, pad);
  const foundationTotal = cardW * 8 + foundationGap * 7;
  const foundationX = (width - foundationTotal) / 2;
  const foundationY = opponentH + (foundationH - cardH) / 2;
  const localY = opponentH + foundationH + clamp(cardH * 0.1, 10, 16);
  const opponentY = pad * 0.7;
  const localFan = fanStep({ count: maxLocalCards, availableSpan: Math.max(cardH, height - localY - cardH - pad), cardHeight: cardH });
  const opponentFan = fanStep({ count: maxOpponentCards, availableSpan: Math.max(compactH * .75, opponentH - opponentY - compactH * .75 - pad), cardHeight: compactH, compact: true });
  return {
    width, height, pad,
    zones: {
      opponent: { x: pad, y: 0, width: contentWidth, height: opponentH },
      foundations: { x: pad, y: opponentH, width: contentWidth, height: foundationH },
      local: { x: pad, y: opponentH + foundationH, width: contentWidth, height: localH }
    },
    card: { width: cardW, height: cardH, compactWidth: compactW, compactHeight: compactH },
    local: {
      stock: { x: pad + cardW * .04, y: localY }, waste: { x: pad + cardW * 1.16, y: localY },
      tableau: localColumns.map((x, index) => ({ x, y: localY, index })), fan: localFan
    },
    opponent: {
      stock: { x: pad + compactW * .04, y: opponentY }, waste: { x: pad + compactW * 1.18, y: opponentY },
      tableau: opponentColumns.map((x, index) => ({ x, y: opponentY, index })), fan: opponentFan
    },
    foundations: FOUNDATION_SUITS.map((suit, index) => ({ x: foundationX + index * (cardW + foundationGap), y: foundationY, index, suit }))
  };
}

export function pilePositions(cards, origin, fan) {
  let offset = 0;
  return cards.map((card, index) => {
    const position = { x: origin.x, y: origin.y + offset, index };
    if (index < cards.length - 1) offset += card.faceDown ? fan.faceDown : fan.faceUp;
    return position;
  });
}

export { FOUNDATION_SUITS };
