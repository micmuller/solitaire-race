import { Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { computeLayout, pilePositions } from '../layout/layout-engine.js';
import { TOKENS } from '../theme/tokens.js';
import { TransitionController } from '../animation/transition-controller.js';
import { RetainedCardStore } from './retained-card-store.js';
import { nearestDropTarget } from '../input/drop-target.js';

const SUITS = { C: '♣', D: '♦', H: '♥', S: '♠' };
const RANKS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const redSuit = (suit) => suit === 'D' || suit === 'H';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function roundedPanel(graphics, x, y, width, height, fill, stroke = TOKENS.colors.brass, alpha = 1, strokeAlpha = .48) {
  graphics.roundRect(x, y, width, height, 12).fill({ color: fill, alpha }).stroke({ color: stroke, alpha: strokeAlpha, width: 1.5 });
}

function cardLabel(card) { return `${RANKS[card.rank] || card.rank}${SUITS[card.suit] || ''}`; }

const PIP_LAYOUTS = Object.freeze({
  1: [[.5,.5]],
  2: [[.5,.25],[.5,.75]],
  3: [[.5,.22],[.5,.5],[.5,.78]],
  4: [[.31,.25],[.69,.25],[.31,.75],[.69,.75]],
  5: [[.31,.23],[.69,.23],[.5,.5],[.31,.77],[.69,.77]],
  6: [[.31,.22],[.69,.22],[.31,.5],[.69,.5],[.31,.78],[.69,.78]],
  7: [[.31,.2],[.69,.2],[.5,.36],[.31,.5],[.69,.5],[.31,.8],[.69,.8]],
  8: [[.31,.19],[.69,.19],[.5,.34],[.31,.5],[.69,.5],[.5,.66],[.31,.81],[.69,.81]],
  9: [[.31,.18],[.69,.18],[.31,.39],[.69,.39],[.5,.5],[.31,.61],[.69,.61],[.31,.82],[.69,.82]],
  10: [[.31,.16],[.69,.16],[.5,.28],[.31,.39],[.69,.39],[.31,.61],[.69,.61],[.5,.72],[.31,.84],[.69,.84]]
});

function drawSuit(graphics, suit, x, y, size, color, alpha = 1) {
  const r=size*.24,stemW=size*.13,stemH=size*.32;
  if (suit === 'D') {
    graphics.poly([x,y-size*.5,x+size*.38,y,x,y+size*.5,x-size*.38,y]).fill({color,alpha});
  } else if (suit === 'H') {
    graphics.moveTo(x,y+size*.48).bezierCurveTo(x-size*.08,y+size*.28,x-size*.48,y+.02,x-size*.48,y-size*.2)
      .bezierCurveTo(x-size*.48,y-size*.5,x-size*.1,y-size*.58,x,y-size*.3)
      .bezierCurveTo(x+size*.1,y-size*.58,x+size*.48,y-size*.5,x+size*.48,y-size*.2)
      .bezierCurveTo(x+size*.48,y+.02,x+size*.08,y+size*.28,x,y+size*.48).fill({color,alpha});
  } else if (suit === 'C') {
    graphics.circle(x,y-size*.23,r).circle(x-size*.24,y+.02,r).circle(x+size*.24,y+.02,r)
      .rect(x-stemW/2,y,size*.13,size*.38).poly([x-size*.2,y+size*.38,x+size*.2,y+size*.38,x,y+size*.14]).fill({color,alpha});
  } else {
    graphics.moveTo(x,y-size*.5).bezierCurveTo(x-size*.08,y-size*.28,x-size*.46,y-.02,x-size*.46,y+size*.18)
      .bezierCurveTo(x-size*.46,y+size*.43,x-size*.12,y+size*.45,x,y+size*.18)
      .bezierCurveTo(x+size*.12,y+size*.45,x+size*.46,y+size*.43,x+size*.46,y+size*.18)
      .bezierCurveTo(x+size*.46,y-.02,x+size*.08,y-size*.28,x,y-size*.5)
      .rect(x-stemW/2,y+size*.13,stemW,stemH).poly([x-size*.2,y+size*.45,x+size*.2,y+size*.45,x,y+size*.23]).fill({color,alpha});
  }
}

function drawCardBack(graphics, width, height, radius, selected) {
  graphics.roundRect(2,3,width,height,radius).fill({color:0x050201,alpha:.34});
  graphics.roundRect(0,0,width,height,radius).fill(TOKENS.colors.leatherDark)
    .stroke({color:selected?TOKENS.colors.amber:TOKENS.colors.brassDark,width:selected?3:1.2});
  graphics.roundRect(width*.035,height*.025,width*.93,height*.95,radius*.78).fill(TOKENS.colors.leather)
    .stroke({color:TOKENS.colors.brassLight,alpha:.72,width:Math.max(1,width*.015)});
  graphics.roundRect(width*.1,height*.07,width*.8,height*.86,radius*.55).fill({color:TOKENS.colors.leatherLight,alpha:.18})
    .stroke({color:TOKENS.colors.brass,alpha:.62,width:Math.max(1,width*.012)});
  const left=width*.16,right=width*.84,top=height*.13,bottom=height*.87,step=Math.max(7,width*.12);
  for(let x=left;x<=right;x+=step) graphics.moveTo(x,top).lineTo(Math.min(right,x+(bottom-top)*.42),bottom);
  for(let x=left;x<=right;x+=step) graphics.moveTo(x,bottom).lineTo(Math.min(right,x+(bottom-top)*.42),top);
  graphics.stroke({color:TOKENS.colors.brassLight,alpha:.12,width:1});
  graphics.circle(width*.5,height*.5,width*.235).fill({color:TOKENS.colors.leatherDark,alpha:.7})
    .stroke({color:TOKENS.colors.brass,alpha:.82,width:Math.max(1.2,width*.018)});
  graphics.circle(width*.5,height*.5,width*.175).stroke({color:TOKENS.colors.brassLight,alpha:.55,width:1});
  const cx=width*.5,cy=height*.5,s=width*.22;
  graphics.poly([cx,cy-s,cx+s*.38,cy-s*.38,cx+s,cy,cx+s*.38,cy+s*.38,cx,cy+s,cx-s*.38,cy+s*.38,cx-s,cy,cx-s*.38,cy-s*.38])
    .fill({color:TOKENS.colors.brass,alpha:.72});
  graphics.circle(cx,cy,s*.28).fill(TOKENS.colors.leatherDark).stroke({color:TOKENS.colors.brassLight,alpha:.7,width:1});
}

function drawCourtCard(graphics, suit, width, height, color, hasPortrait) {
  if(hasPortrait)return;
  const x=width*.19,y=height*.18,w=width*.62,h=height*.64;
  graphics.roundRect(x,y,w,h,width*.055);
  graphics.fill({color:TOKENS.colors.ivoryShade,alpha:.42});
  graphics.stroke({color:0x9b7c52,alpha:.68,width:1});
  graphics.rect(x+w*.08,y+h*.08,w*.84,h*.84).stroke({color,alpha:.22,width:1});
  graphics.poly([width*.33,height*.39,width*.4,height*.27,width*.5,height*.37,width*.6,height*.27,width*.67,height*.39])
    .fill({color:TOKENS.colors.brass,alpha:.72}).stroke({color,alpha:.48,width:1});
  graphics.moveTo(width*.31,height*.55).lineTo(width*.69,height*.55).stroke({color:TOKENS.colors.brass,alpha:.36,width:1});
  drawSuit(graphics,suit,width*.5,height*.69,width*.19,color,.92);
}

function createCourtTextures(atlas) {
  if(!atlas?.source||!atlas.width||!atlas.height)return null;
  const frameWidth=atlas.width/3;
  return {
    13:new Texture({source:atlas.source,frame:new Rectangle(0,0,frameWidth,atlas.height)}),
    12:new Texture({source:atlas.source,frame:new Rectangle(frameWidth,0,frameWidth,atlas.height)}),
    11:new Texture({source:atlas.source,frame:new Rectangle(frameWidth*2,0,frameWidth,atlas.height)})
  };
}

class CardView extends Container {
  constructor(card, courtTextures) {
    super();
    this.cardId = card.cardId;
    this.shadow = new Graphics();
    this.surface = new Graphics();
    this.courtPortrait = new Sprite();
    this.art = new Graphics();
    this.rankTop = new Text({ text:'', style:{fontFamily:'Georgia',fontWeight:'700',fill:TOKENS.colors.ink,align:'center'} });
    this.rankBottom = new Text({ text:'', style:{fontFamily:'Georgia',fontWeight:'700',fill:TOKENS.colors.ink,align:'center'} });
    this.courtLabel = new Text({ text:'', style:{fontFamily:'Georgia',fontWeight:'700',fill:TOKENS.colors.ink,align:'center'} });
    this.courtTextures=courtTextures;
    this.addChild(this.shadow,this.surface,this.courtPortrait,this.art,this.rankTop,this.rankBottom,this.courtLabel);
    this.update(card, 80, 114, false);
  }

  update(card, width, height, compact, { selected = false, pending = false, shadows = true } = {}) {
    this.card = card;
    this.shadow.clear(); this.surface.clear(); this.art.clear();
    this.rankTop.text=''; this.rankBottom.text=''; this.courtLabel.text='';
    this.courtPortrait.visible=false;
    const radius = Math.max(4, width * .075);
    if(shadows) this.shadow.roundRect(width*.025,height*.035,width,height,radius).fill({color:0x000000,alpha:compact?.2:.3});
    if (card.faceDown) {
      drawCardBack(this.surface,width,height,radius,selected);
    } else {
      const color = redSuit(card.suit) ? TOKENS.colors.red : TOKENS.colors.black;
      this.surface.roundRect(0,0,width,height,radius).fill(TOKENS.colors.ivoryShade)
        .stroke({color:selected?TOKENS.colors.amber:0x8b6e49,width:selected?3:1});
      this.surface.roundRect(width*.018,height*.012,width*.964,height*.965,radius*.88).fill(TOKENS.colors.ivory);
      this.surface.roundRect(width*.045,height*.032,width*.91,height*.925,radius*.6).fill({color:TOKENS.colors.ivoryLight,alpha:.32})
        .stroke({color:0x8c7356,alpha:.24,width:1});
      for(let i=0;i<7;i++) this.surface.circle(width*(.14+((i*37)%71)/100),height*(.14+((i*53)%73)/100),Math.max(.35,width*.006)).fill({color:0x8b7358,alpha:.09});

      const rank=RANKS[card.rank]||String(card.rank),fontSize=compact?width*.215:width*.205;
      const cornerRankX=card.rank===10?width*.15:width*.105,cornerSuitX=card.rank===10?width*.315:width*.235;
      this.rankTop.text=rank; this.rankTop.style.fill=color; this.rankTop.style.fontSize=fontSize;
      this.rankTop.anchor.set(.5,0); this.rankTop.position.set(cornerRankX,height*.025);
      this.rankBottom.text=rank; this.rankBottom.style.fill=color; this.rankBottom.style.fontSize=fontSize;
      this.rankBottom.anchor.set(.5,0); this.rankBottom.position.set(width-cornerRankX,height*.975); this.rankBottom.rotation=Math.PI;
      drawSuit(this.art,card.suit,cornerSuitX,height*.087,width*.12,color);
      drawSuit(this.art,card.suit,width-cornerSuitX,height*.913,width*.12,color);

      if(card.rank<=10){
        const pipSize=width*(card.rank===1?.34:(compact?.15:.16));
        for(const [px,py] of PIP_LAYOUTS[card.rank]) drawSuit(this.art,card.suit,width*px,height*(.13+py*.74),pipSize,color,.94);
      }else{
        const portrait=this.courtTextures?.[card.rank];
        if(portrait){
          this.courtPortrait.texture=portrait; this.courtPortrait.visible=true;
          this.courtPortrait.position.set(width*.1,height*.085); this.courtPortrait.width=width*.8; this.courtPortrait.height=height*.83;
        }
        drawCourtCard(this.art,card.suit,width,height,color,Boolean(portrait));
        if(!portrait){
          this.courtLabel.text=rank; this.courtLabel.style.fill=color; this.courtLabel.style.fontSize=width*.31;
          this.courtLabel.anchor.set(.5); this.courtLabel.position.set(width*.5,height*.47);
        }
      }
    }
    this.alpha = pending ? .82 : 1;
    this.hitArea = { contains: (x, y) => x >= 0 && y >= 0 && x <= width && y <= height };
    this.cardWidth = width; this.cardHeight = height;
  }
}

export class BoardScene {
  constructor(app, { onSource, onStock, onTarget, onAutoFoundation, canInteract, quality, courtAtlas = null }) {
    this.app = app;
    this.callbacks = { onSource, onStock, onTarget, onAutoFoundation, canInteract };
    this.quality = quality;
    this.courtTextures=createCourtTextures(courtAtlas);
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
    const localProfile=this.stackProfile(this.local?.tableau),opponentProfile=this.stackProfile(this.opponent?.tableau,true);
    this.layout = computeLayout(width, height, {
      maxLocalCards:localProfile.count,maxOpponentCards:opponentProfile.count,
      localFaceDownCount:localProfile.faceDownCount,opponentFaceDownCount:opponentProfile.faceDownCount
    });
    this.drawBoard();
    if (this.current) this.applyState(this.current, { source: 'snapshot', force: true });
  }

  maxStack(tableau) { return Math.max(1, ...(tableau || []).map((pile) => pile.length)); }

  stackProfile(tableau, compact = false) {
    const downWeight=compact?.075:.095,openWeight=compact?.17:.205;
    return (tableau||[]).reduce((best,pile)=>{
      const faceDownCount=pile.filter((card)=>card.faceDown).length;
      const demand=faceDownCount*downWeight+Math.max(0,pile.length-1-faceDownCount)*openWeight;
      return demand>best.demand?{count:Math.max(1,pile.length),faceDownCount,demand}:best;
    },{count:1,faceDownCount:0,demand:-1});
  }

  transitionDuration(source, force, cardId) {
    if (source !== 'ack' || force || this.dropHandoff?.ids.includes(cardId)) return 0;
    return 220 * this.quality.motionScale;
  }

  drawBoard() {
    const { width, height, zones, foundations, card, pad } = this.layout;
    this.background.clear().rect(0, 0, width, height).fill(TOKENS.colors.felt);
    for (let x = -height; x < width + height; x += 18) this.background.moveTo(x, 0).lineTo(x + height, height).stroke({ color: TOKENS.colors.feltLight, alpha: .08, width: 1 });
    this.zones.clear();
    roundedPanel(this.zones, pad * .35, pad * .28, width - pad * .7, zones.opponent.height - pad * .1, 0x071f18, TOKENS.colors.woodLight, .38, 0);
    const foundationInsetX=clamp(card.width*.14,8,15),foundationInsetY=clamp(card.height*.045,5,8);
    const foundationLeft=foundations[0].x-foundationInsetX,foundationRight=foundations.at(-1).x+card.width+foundationInsetX;
    roundedPanel(this.zones, foundationLeft, foundations[0].y-foundationInsetY, foundationRight-foundationLeft, card.height+foundationInsetY*2, TOKENS.colors.wood, TOKENS.colors.brass, .72);
    roundedPanel(this.zones, pad * .35, zones.local.y + pad * .15, width - pad * .7, zones.local.height - pad * .3, TOKENS.colors.feltLight, TOKENS.colors.woodLight, .18, 0);
  }

  applyState(current, { source = 'snapshot', force = false } = {}) {
    this.current = current;
    const state = current.state;
    const localId = this.localId || 'p1';
    const opponentId = localId === 'p1' ? 'p2' : 'p1';
    this.local = state.players[localId]; this.opponent = state.players[opponentId];
    const localProfile=this.stackProfile(this.local.tableau),opponentProfile=this.stackProfile(this.opponent.tableau,true);
    const nextLayout = computeLayout(this.layout.width, this.layout.height, {
      maxLocalCards:localProfile.count,maxOpponentCards:opponentProfile.count,
      localFaceDownCount:localProfile.faceDownCount,opponentFaceDownCount:opponentProfile.faceDownCount
    });
    this.layout = nextLayout; this.drawBoard(); this.drawSlots();
    const placements = this.collectPlacements(state, localId, opponentId);
    const seen = new Set();
    for (const placement of placements) {
      seen.add(placement.card.cardId);
      const isNew = !this.cards.has(placement.card.cardId);
      const view = this.cardStore.getOrCreate(placement.card.cardId, () => new CardView(placement.card,this.courtTextures));
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
      view.update(placement.card, placement.width, placement.height, placement.compact, { selected: this.selection?.cardIds?.includes(placement.card.cardId), pending: this.pending && this.selection?.cardIds?.includes(placement.card.cardId), shadows:this.quality.shadows });
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
      view.update(view.card, view.cardWidth, view.cardHeight, view.meta?.compact, { selected: false, pending: false, shadows:this.quality.shadows });
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
