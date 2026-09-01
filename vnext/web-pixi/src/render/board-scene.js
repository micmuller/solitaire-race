import { Container, Graphics, Text } from 'pixi.js';
import { computeLayout, pilePositions } from '../layout/layout-engine.js';
import { TOKENS } from '../theme/tokens.js';
import { TransitionController } from '../animation/transition-controller.js';
import { RetainedCardStore } from './retained-card-store.js';
import { nearestDropTarget } from '../input/drop-target.js';

const SUITS = { C: '♣', D: '♦', H: '♥', S: '♠' };
const RANKS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const redSuit = (suit) => suit === 'D' || suit === 'H';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function roundedPanel(graphics, x, y, width, height, fill, stroke = TOKENS.colors.brass, alpha = 1) {
  graphics.roundRect(x, y, width, height, 12).fill({ color: fill, alpha }).stroke({ color: stroke, alpha: .48, width: 1.5 });
}

function cardLabel(card) { return `${RANKS[card.rank] || card.rank}${SUITS[card.suit] || ''}`; }

class CardView extends Container {
  constructor(card) {
    super();
    this.cardId = card.cardId;
    this.surface = new Graphics();
    this.corner = new Text({ text: '', style: { fontFamily: 'Georgia', fontWeight: '700', fill: TOKENS.colors.ink, align: 'center' } });
    this.center = new Text({ text: '', style: { fontFamily: 'Georgia', fill: TOKENS.colors.ink, align: 'center' } });
    this.addChild(this.surface, this.corner, this.center);
    this.update(card, 80, 114, false);
  }

  update(card, width, height, compact, { selected = false, pending = false } = {}) {
    this.card = card;
    this.surface.clear();
    const radius = Math.max(4, width * .075);
    if (card.faceDown) {
      this.surface.roundRect(0, 0, width, height, radius).fill(TOKENS.colors.leather).stroke({ color: selected ? TOKENS.colors.amber : TOKENS.colors.brass, width: selected ? 3 : 1.4 });
      this.surface.roundRect(width * .09, height * .065, width * .82, height * .87, radius * .6).stroke({ color: TOKENS.colors.brassLight, alpha: .68, width: 1.2 });
      this.surface.moveTo(width * .16, height * .2).lineTo(width * .84, height * .8).moveTo(width * .84, height * .2).lineTo(width * .16, height * .8).stroke({ color: TOKENS.colors.brass, alpha: .26, width: 1 });
      this.surface.circle(width / 2, height / 2, width * .19).stroke({ color: TOKENS.colors.brassLight, alpha: .62, width: 2 });
      this.corner.text = ''; this.center.text = '✦'; this.center.style.fill = TOKENS.colors.brassLight;
      this.center.style.fontSize = width * .25;
    } else {
      this.surface.roundRect(0, 0, width, height, radius).fill(TOKENS.colors.ivory).stroke({ color: selected ? TOKENS.colors.amber : 0x9b7c52, width: selected ? 3 : 1 });
      this.surface.rect(width * .04, height * .04, width * .92, height * .92).stroke({ color: 0x8c7356, alpha: .18, width: 1 });
      const color = redSuit(card.suit) ? TOKENS.colors.red : TOKENS.colors.black;
      this.corner.text = `${RANKS[card.rank] || card.rank}\n${SUITS[card.suit]}`;
      this.corner.style.fill = color; this.corner.style.fontSize = compact ? width * .23 : width * .235; this.corner.style.lineHeight = compact ? width * .2 : width * .205;
      this.corner.position.set(width * .08, height * .055);
      this.center.text = SUITS[card.suit]; this.center.style.fill = color; this.center.style.fontSize = width * .43;
    }
    this.center.anchor.set(.5); this.center.position.set(width / 2, height * .58);
    this.alpha = pending ? .82 : 1;
    this.hitArea = { contains: (x, y) => x >= 0 && y >= 0 && x <= width && y <= height };
    this.cardWidth = width; this.cardHeight = height;
  }
}

export class BoardScene {
  constructor(app, { onSource, onStock, onTarget, onAutoFoundation, canInteract, quality }) {
    this.app = app;
    this.callbacks = { onSource, onStock, onTarget, onAutoFoundation, canInteract };
    this.quality = quality;
    this.root = new Container();
    this.background = new Graphics();
    this.zones = new Graphics();
    this.slotLayer = new Container();
    this.cardLayer = new Container();
    this.transient = new Container();
    this.effects = new Container();
    this.root.addChild(this.background, this.zones, this.slotLayer, this.cardLayer, this.transient, this.effects);
    this.app.stage.addChild(this.root);
    this.cardStore = new RetainedCardStore();
    this.cards = this.cardStore.items;
    this.positions = new Map();
    this.targets = [];
    this.selection = null;
    this.pending = false;
    this.drag = null;
    this.lastTap = null;
    this.transitions = new TransitionController();
    this.app.ticker.add(() => this.transitions.tick());
    this.app.stage.eventMode = 'static';
    this.app.stage.on('globalpointermove', (event) => this.pointerMove(event));
    this.app.stage.on('pointerup', (event) => this.pointerUp(event));
    this.app.stage.on('pointerupoutside', (event) => this.pointerUp(event));
  }

  resize(width, height) {
    this.layout = computeLayout(width, height, {
      maxLocalCards: this.maxStack(this.local?.tableau), maxOpponentCards: this.maxStack(this.opponent?.tableau)
    });
    this.drawBoard();
    if (this.current) this.applyState(this.current, { source: 'snapshot', force: true });
  }

  maxStack(tableau) { return Math.max(1, ...(tableau || []).map((pile) => pile.length)); }

  transitionDuration(source, force, cardId) {
    if (source !== 'ack' || force || this.dropHandoff?.ids.includes(cardId)) return 0;
    return 220 * this.quality.motionScale;
  }

  drawBoard() {
    const { width, height, zones, foundations, card, pad } = this.layout;
    this.background.clear().rect(0, 0, width, height).fill(TOKENS.colors.felt);
    for (let x = -height; x < width + height; x += 18) this.background.moveTo(x, 0).lineTo(x + height, height).stroke({ color: TOKENS.colors.feltLight, alpha: .08, width: 1 });
    this.zones.clear();
    roundedPanel(this.zones, pad * .35, pad * .28, width - pad * .7, zones.opponent.height - pad * .1, 0x071f18, TOKENS.colors.woodLight, .38);
    const foundationInsetX=clamp(card.width*.14,8,15),foundationInsetY=clamp(card.height*.045,5,8);
    const foundationLeft=foundations[0].x-foundationInsetX,foundationRight=foundations.at(-1).x+card.width+foundationInsetX;
    roundedPanel(this.zones, foundationLeft, foundations[0].y-foundationInsetY, foundationRight-foundationLeft, card.height+foundationInsetY*2, TOKENS.colors.wood, TOKENS.colors.brass, .72);
    roundedPanel(this.zones, pad * .35, zones.local.y + pad * .15, width - pad * .7, zones.local.height - pad * .3, TOKENS.colors.feltLight, TOKENS.colors.woodLight, .18);
    this.zones.moveTo(pad * 2, zones.local.y).lineTo(width - pad * 2, zones.local.y).stroke({ color: TOKENS.colors.brass, alpha: .36, width: 1 });
  }

  applyState(current, { source = 'snapshot', force = false } = {}) {
    this.current = current;
    const state = current.state;
    const localId = this.localId || 'p1';
    const opponentId = localId === 'p1' ? 'p2' : 'p1';
    this.local = state.players[localId]; this.opponent = state.players[opponentId];
    const nextLayout = computeLayout(this.layout.width, this.layout.height, {
      maxLocalCards: this.maxStack(this.local.tableau), maxOpponentCards: this.maxStack(this.opponent.tableau)
    });
    this.layout = nextLayout; this.drawBoard(); this.drawSlots();
    const placements = this.collectPlacements(state, localId, opponentId);
    const seen = new Set();
    for (const placement of placements) {
      seen.add(placement.card.cardId);
      const isNew = !this.cards.has(placement.card.cardId);
      const view = this.cardStore.getOrCreate(placement.card.cardId, () => new CardView(placement.card));
      if (isNew) {
        this.cardLayer.addChild(view);
        view.on('pointerdown', (event) => this.pointerDown(event, placement.card.cardId));
        view.on('pointertap', (event) => this.pointerTap(event, placement.card.cardId));
        view.on('pointerover', () => { if (view.meta?.interactive && !this.drag) { view.y -= 3; view.scale.set(1.015); } });
        view.on('pointerout', () => { if (!this.drag) { const target=this.positions.get(view.cardId); if(target)view.position.set(target.x,target.y); view.scale.set(1); } });
      }
      view.zIndex = placement.z;
      view.eventMode = placement.interactive ? 'static' : 'none'; view.cursor = placement.interactive ? 'pointer' : 'default';
      view.meta = placement;
      view.update(placement.card, placement.width, placement.height, placement.compact, { selected: this.selection?.cardIds?.includes(placement.card.cardId), pending: this.pending && this.selection?.cardIds?.includes(placement.card.cardId) });
      const previous = this.positions.get(placement.card.cardId) || { x: placement.x, y: placement.y };
      const duration = this.transitionDuration(source, force, placement.card.cardId);
      if (duration > 0 && (previous.x !== placement.x || previous.y !== placement.y)) {
        this.transitions.move(placement.card.cardId, { x: view.x, y: view.y }, placement, duration, (p) => view.position.set(p.x, p.y));
      } else view.position.set(placement.x, placement.y);
      this.positions.set(placement.card.cardId, { x: placement.x, y: placement.y });
    }
    this.cardStore.prune(seen, (view, id) => { view.destroy({ children: true }); this.positions.delete(id); });
    this.cardLayer.sortableChildren = true; this.cardLayer.sortChildren();
    if (source === 'snapshot') this.transitions.cancelAndSnap(() => { for (const [id, p] of this.positions) this.cards.get(id)?.position.set(p.x, p.y); });
  }

  collectPlacements(state, localId, opponentId) {
    const result = []; const { card, local, opponent, foundations } = this.layout;
    const add = (cardData, p, meta) => result.push({ card: cardData, x: p.x, y: p.y, width: meta.compact ? card.compactWidth : card.width, height: meta.compact ? card.compactHeight : card.height, ...meta });
    const player = (data, geometry, owner, compact, interactive) => {
      if (data.stock.length) add(data.stock.at(-1), geometry.stock, { owner, zone: 'stock', compact, interactive, z: compact ? 100 : 400 });
      if (data.waste.length) add(data.waste.at(-1), geometry.waste, { owner, zone: 'waste', compact, interactive, z: compact ? 110 : 410, cardIndex: data.waste.length - 1, pileCards: data.waste });
      data.tableau.forEach((pile, index) => pilePositions(pile, geometry.tableau[index], geometry.fan).forEach((p, cardIndex) => add(pile[cardIndex], p, { owner, zone: 'tableau', pileIndex: index, cardIndex, pileCards: pile, compact, interactive, z: (compact ? 120 : 420) + index * 30 + cardIndex })));
    };
    player(state.players[opponentId], opponent, opponentId, true, false);
    state.foundations.forEach((foundation, index) => { if (foundation.cards.length) add(foundation.cards.at(-1), foundations[index], { owner: 'global', zone: 'foundation', pileIndex: index, compact: false, interactive: false, z: 300 + index }); });
    player(state.players[localId], local, localId, false, localId === this.localId && this.localId !== 'observer');
    return result;
  }

  drawSlots() {
    this.slotLayer.removeChildren().forEach((child) => child.destroy()); this.targets = [];
    const { card, foundations, local, opponent } = this.layout;
    const slot = (p, width, height, target, label, interactive = false) => {
      const container = new Container();
      const surface = new Graphics().roundRect(0, 0, width, height, Math.max(5, width * .07)).fill({ color: TOKENS.colors.slot, alpha: .72 }).stroke({ color: this.selection && interactive ? TOKENS.colors.amber : TOKENS.colors.brass, alpha: this.selection && interactive ? .9 : .42, width: this.selection && interactive ? 2.5 : 1.2 });
      container.addChild(surface);
      if (label) { const t = new Text({ text: label, style: { fontFamily: 'Georgia', fontSize: width * .32, fill: TOKENS.colors.brass, align: 'center' } }); t.anchor.set(.5); t.position.set(width / 2, height / 2); container.addChild(t); }
      container.position.set(p.x, p.y); container.eventMode = interactive ? 'static' : 'none'; container.cursor = interactive ? 'pointer' : 'default'; container.hitArea={contains:(x,y)=>x>=0&&y>=0&&x<=width&&y<=height}; if (interactive) container.on('pointertap', () => this.callbacks.onTarget?.(target));
      this.slotLayer.addChild(container); this.targets.push({ ...target, x: p.x, y: p.y, width, height });
    };
    slot(opponent.stock, card.compactWidth, card.compactHeight, {}, '✦'); slot(opponent.waste, card.compactWidth, card.compactHeight, {}, '');
    foundations.forEach((p) => slot(p, card.width, card.height, { zone: 'foundation', index: p.index }, SUITS[p.suit], Boolean(this.selection)));
    slot(local.stock, card.width, card.height, { zone: 'stock' }, '✦', true); slot(local.waste, card.width, card.height, {}, '');
    local.tableau.forEach((p) => slot(p, card.width, card.height, { zone: 'tableau', index: p.index }, '', Boolean(this.selection)));
  }

  setLocalId(id) { this.localId = id === 'observer' ? 'p1' : id; this.readOnly = id === 'observer'; }
  setSelection(selection) { this.selection = selection; if (this.current) this.applyState(this.current, { source: 'local', force: true }); }
  setPending(value) { this.pending = value; if(value&&this.dropHandoff){for(const id of this.dropHandoff.ids){const view=this.cards.get(id);if(view)view.alpha=.82;}return;} if (this.current) this.applyState(this.current, { source: 'local', force: true }); }
  clearTransient() { this.drag = null; this.dropHandoff = null; this.selection = null; this.pending = false; this.lastTap = null; this.transitions.cancelAndSnap(() => { for (const [id,p] of this.positions) this.cards.get(id)?.position.set(p.x,p.y); }); }
  cancelInteraction() {
    this.drag = null; this.dropHandoff = null; this.selection = null; this.pending = false; this.lastTap = null;
    for (const view of this.cards.values()) {
      view.update(view.card, view.cardWidth, view.cardHeight, view.meta?.compact, { selected: false, pending: false });
    }
  }
  rejectToAuthority() { const dragged = this.drag?.ids || this.dropHandoff?.ids || this.selection?.cardIds || []; for (const id of dragged) { const view=this.cards.get(id), target=this.positions.get(id); if(view&&target) this.transitions.move(`reject:${id}`,{x:view.x,y:view.y},target,160*this.quality.motionScale,(p)=>view.position.set(p.x,p.y)); } this.drag=null; this.dropHandoff=null; }

  celebrate({ force = false } = {}) {
    if (!this.quality.particles && !force) return false;
    this.stopCelebration?.();
    const palette=[TOKENS.colors.brassLight,TOKENS.colors.amber,0xd95446,0x76c98b,0xf3ead6];
    const confettiCount=Math.max(36,this.quality.particles*2,force?64:0);
    const particles=[];
    for(let index=0;index<confettiCount;index++){
      const width=4+(index%4),height=7+(index%3)*2;
      const g=new Graphics().rect(-width/2,-height/2,width,height).fill(palette[index%palette.length]);
      g.position.set((index*83)%this.layout.width,-12-(index%9)*16); g.vx=((index%11)-5)*.025; g.vy=.16+(index%7)*.025; g.spin=((index%5)-2)*.004; g.gravity=.00016; this.effects.addChild(g); particles.push(g);
    }
    const bursts=[{x:.23,y:.34},{x:.5,y:.25},{x:.77,y:.36}];
    bursts.forEach((burst,burstIndex)=>Array.from({length:22},(_,index)=>{
      const angle=(Math.PI*2*index)/22, speed=.12+(index%5)*.016;
      const g=new Graphics().circle(0,0,2.1+(index%3)*.6).fill(palette[(index+burstIndex)%palette.length]);
      g.position.set(this.layout.width*burst.x,this.layout.height*burst.y); g.vx=Math.cos(angle)*speed; g.vy=Math.sin(angle)*speed; g.spin=0; g.gravity=.00009; g.burst=true; this.effects.addChild(g); particles.push(g); return g;
    }));
    let elapsed=0;
    const tick=(ticker)=>{
      elapsed+=ticker.deltaMS;
      for(const particle of particles){particle.vy+=particle.gravity*ticker.deltaMS;particle.x+=particle.vx*ticker.deltaMS;particle.y+=particle.vy*ticker.deltaMS;particle.rotation+=particle.spin*ticker.deltaMS;particle.alpha=Math.max(0,1-Math.max(0,elapsed-(particle.burst?850:1500))/(particle.burst?1000:1100));}
      if(elapsed>2700)this.stopCelebration?.();
    };
    this.stopCelebration=()=>{this.app.ticker.remove(tick);particles.forEach((particle)=>particle.destroy());this.stopCelebration=null;};
    this.app.ticker.add(tick); return true;
  }

  diagnostics() {
    const renderer=this.app.renderer;
    return { width:Math.round(this.layout?.width||0),height:Math.round(this.layout?.height||0),cardWidth:Math.round(this.layout?.card.width||0),cardHeight:Math.round(this.layout?.card.height||0),resolution:renderer.resolution };
  }

  pointerTap(event, id) {
    if (!this.callbacks.canInteract() || this.drag?.active) return;
    const view = this.cards.get(id); if (!view?.meta?.interactive) return;
    const now = performance.now(); const double = this.lastTap?.id === id && now - this.lastTap.time < 340;
    this.lastTap = double ? null : { id, time: now };
    if (double && !view.card.faceDown) this.callbacks.onAutoFoundation?.(view.meta, view.card);
    else this.callbacks.onSource?.(view.meta, view.card);
  }

  pointerDown(event, id) {
    if (!this.callbacks.canInteract()) return;
    const view = this.cards.get(id), meta = view?.meta; if (!meta?.interactive || meta.zone === 'stock' || meta.zone === 'foundation') return;
    const ids = meta.zone === 'tableau' ? meta.pileCards.slice(meta.cardIndex).map((card) => card.cardId) : [id];
    if (meta.card.faceDown) return;
    this.drag = { pointerId: event.pointerId, start: event.global.clone(), point: event.global.clone(), ids, source: meta, offsets: new Map(ids.map((cardId) => [cardId, { x: this.cards.get(cardId).x, y: this.cards.get(cardId).y }])), active: false };
  }

  pointerMove(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const dx = event.global.x - this.drag.start.x, dy = event.global.y - this.drag.start.y;
    if (!this.drag.active && Math.hypot(dx,dy) > 7) { this.drag.active = true; this.callbacks.onSource?.(this.drag.source, this.drag.source.card); }
    if (this.drag.active) for (const id of this.drag.ids) { const view=this.cards.get(id), origin=this.drag.offsets.get(id); if(view&&origin) { view.position.set(origin.x+dx,origin.y+dy); view.zIndex=999; } }
  }

  pointerUp(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const drag=this.drag; this.drag=null; if (!drag.active) return;
    const target=nearestDropTarget(this.targets,event.global,this.layout.card);
    const samePile=target?.zone==='tableau'&&drag.source.zone==='tableau'&&target.index===drag.source.pileIndex;
    if (target&&!samePile) { this.dropHandoff={ids:[...drag.ids]}; const sent=this.callbacks.onTarget?.({ zone:target.zone,index:target.index }); if(sent===false){this.dropHandoff=null;this.rejectToAuthority();} } else this.rejectToAuthority();
  }

  destroy() { this.stopCelebration?.(); this.transitions.cancelAndSnap(); this.root.destroy({ children: true }); }
}
