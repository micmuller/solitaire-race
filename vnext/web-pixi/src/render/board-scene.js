import { Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { computeLayout, pilePositions } from '../layout/layout-engine.js';
import { TOKENS } from '../theme/tokens.js';
import { TransitionController } from '../animation/transition-controller.js';
import { RetainedCardStore } from './retained-card-store.js';
import { nearestDropTarget } from '../input/drop-target.js';
import { celebrationProfileFor } from './renderer-profile.js';

const SUITS = { C: '♣', D: '♦', H: '♥', S: '♠' };
const RANKS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const redSuit = (suit) => suit === 'D' || suit === 'H';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function motionProfileFor(placement = {}) {
  if (placement.zone === 'foundation') return { duration: 270, lift: .075, scale: .035 };
  if (placement.zone === 'waste') return { duration: 235, lift: .045, scale: .025 };
  return { duration: TOKENS.motion.move, lift: .05, scale: .025 };
}

export function visiblePileCards(cards, limit = 3) {
  const visible=cards.slice(Math.max(0,cards.length-limit));
  return visible.map((card,index)=>({card,depth:visible.length-1-index,isTop:index===visible.length-1}));
}

export function shouldAnimateFlip({ wasFaceDown, faceDown, moving, source, force, motionScale }) {
  return Boolean(wasFaceDown && !faceDown && !moving && source === 'ack' && !force && motionScale > 0);
}

export function placementMatchesHandoffTarget(placement, target) {
  if (!placement || !target || placement.zone !== target.zone) return false;
  if (target.zone === 'tableau') return placement.pileIndex === target.index;
  return true;
}

export function handoffReachedTarget(handoff, placements) {
  if (!handoff?.ids?.length || !handoff.target) return false;
  const byId=new Map(placements.map((placement)=>[placement.card.cardId,placement]));
  return handoff.ids.every((cardId)=>placementMatchesHandoffTarget(byId.get(cardId),handoff.target));
}

export function handoffReachedState(handoff, state, ownerId) {
  if(!handoff?.ids?.length||!handoff.target||!state)return false;
  const player=state.players?.[ownerId];
  if(handoff.target.zone==='tableau'){
    const ids=new Set((player?.tableau?.[handoff.target.index]||[]).map((card)=>card.cardId));
    return handoff.ids.every((cardId)=>ids.has(cardId));
  }
  if(handoff.target.zone==='foundation'){
    const ids=new Set((state.foundations||[]).flatMap((foundation)=>foundation.cards||[]).map((card)=>card.cardId));
    return handoff.ids.every((cardId)=>ids.has(cardId));
  }
  return false;
}

export function shouldSuppressPostDragTap(now, suppressUntil) {
  return Number.isFinite(suppressUntil) && now < suppressUntil;
}

export function shouldHoldActiveDrag(source, drag, cardId) {
  return source==='ack'&&Boolean(drag?.active&&drag.ids?.includes(cardId));
}

export function cardVisualSignature(card, width, height, compact, { selected = false, pending = false, shadows = true } = {}) {
  return [card?.cardId,card?.suit,card?.rank,Boolean(card?.faceDown),width,height,Boolean(compact),selected,pending,shadows].join('|');
}

function roundedPanel(graphics, x, y, width, height, fill, stroke = TOKENS.colors.brass, alpha = 1, strokeAlpha = .48) {
  graphics.roundRect(x, y, width, height, 12).fill({ color: fill, alpha }).stroke({ color: stroke, alpha: strokeAlpha, width: 1.5 });
}

function cardLabel(card) { return `${RANKS[card.rank] || card.rank}${SUITS[card.suit] || ''}`; }

export function cardWearUnit(cardId, salt = 0) {
  const value = `${cardId || 'card'}:${salt}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function drawCardWear(graphics, card, width, height) {
  const edge = TOKENS.colors.cardWear;
  graphics.ellipse(width*.12,height*.1,width*.13,height*.07).fill({color:edge,alpha:.045});
  graphics.ellipse(width*.87,height*.91,width*.16,height*.085).fill({color:edge,alpha:.055});
  graphics.moveTo(width*.08,height*.24).bezierCurveTo(width*.035,height*.4,width*.065,height*.59,width*.045,height*.73)
    .stroke({color:edge,alpha:.09,width:Math.max(.7,width*.012)});
  for (let index = 0; index < 11; index += 1) {
    const x = width * (.1 + cardWearUnit(card.cardId, index*4) * .8);
    const y = height * (.09 + cardWearUnit(card.cardId, index*4+1) * .82);
    const radius = width * (.004 + cardWearUnit(card.cardId, index*4+2) * .012);
    const alpha = .035 + cardWearUnit(card.cardId, index*4+3) * .065;
    graphics.circle(x,y,Math.max(.45,radius)).fill({color:edge,alpha});
  }
}

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
    const renderSignature=cardVisualSignature(card,width,height,compact,{selected,pending,shadows});
    if(this.renderSignature===renderSignature)return false;
    this.renderSignature=renderSignature;
    this.shadow.clear(); this.surface.clear(); this.art.clear();
    this.rankTop.text=''; this.rankBottom.text=''; this.courtLabel.text='';
    this.courtPortrait.visible=false;
    const radius = Math.max(4, width * .075);
    if(shadows) this.shadow.roundRect(width*.025,height*.035,width,height,radius).fill({color:0x000000,alpha:compact?.2:.3});
    if (card.faceDown) {
      drawCardBack(this.surface,width,height,radius,selected);
    } else {
      const color = redSuit(card.suit) ? TOKENS.colors.red : TOKENS.colors.black;
      this.surface.roundRect(0,0,width,height,radius).fill(TOKENS.colors.cardPaperShade)
        .stroke({color:selected?TOKENS.colors.amber:TOKENS.colors.cardPaperEdge,width:selected?3:1});
      this.surface.roundRect(width*.018,height*.012,width*.964,height*.965,radius*.88).fill(TOKENS.colors.cardPaper);
      this.surface.roundRect(width*.045,height*.032,width*.91,height*.925,radius*.6).fill({color:TOKENS.colors.cardPaperLight,alpha:.38})
        .stroke({color:TOKENS.colors.cardPaperEdge,alpha:.3,width:1});
      drawCardWear(this.surface,card,width,height);

      const rank=RANKS[card.rank]||String(card.rank),fontSize=compact?width*.215:width*.205;
      const cornerRankX=card.rank===10?width*.15:width*.105,cornerSuitX=card.rank===10?width*.33:width*.255;
      this.rankTop.text=rank; this.rankTop.style.fill=color; this.rankTop.style.fontSize=fontSize;
      this.rankTop.anchor.set(.5,0); this.rankTop.position.set(cornerRankX,height*.025);
      this.rankBottom.text=rank; this.rankBottom.style.fill=color; this.rankBottom.style.fontSize=fontSize;
      this.rankBottom.anchor.set(.5,0); this.rankBottom.position.set(width-cornerRankX,height*.975); this.rankBottom.rotation=Math.PI;
      drawSuit(this.art,card.suit,cornerSuitX,height*.087,width*.15,color);
      drawSuit(this.art,card.suit,width-cornerSuitX,height*.913,width*.15,color);

      if(card.rank<=10){
        const pipSize=width*(card.rank===1?.38:(compact?.17:.18));
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
    return true;
  }
}

export class BoardScene {
  constructor(app, { onSource, onStock, onTarget, onAutoFoundation, canInteract, quality, stockSide = 'left', courtAtlas = null, materials = {}, rendererPreference = 'unknown', tickerMaxFps = 0, prefersReducedMotion = false }) {
    this.app = app;
    this.callbacks = { onSource, onStock, onTarget, onAutoFoundation, canInteract };
    this.quality = quality;
    this.rendererPreference = rendererPreference;
    this.tickerMaxFps = tickerMaxFps;
    this.prefersReducedMotion = prefersReducedMotion;
    this.stockSide = stockSide === 'right' ? 'right' : 'left';
    this.courtTextures=createCourtTextures(courtAtlas);
    this.root = new Container();
    this.background = new Graphics();
    this.feltMaterial = new Sprite();
    this.woodMaterial = new Sprite();
    this.woodMask = new Graphics();
    this.zones = new Graphics();
    this.lighting = new Graphics();
    if(materials.felt)this.feltMaterial.texture=materials.felt;
    if(materials.wood)this.woodMaterial.texture=materials.wood;
    this.feltMaterial.visible=Boolean(materials.felt);
    this.woodMaterial.visible=Boolean(materials.wood);
    this.woodMaterial.mask=this.woodMask;
    this.slotLayer = new Container();
    this.cardLayer = new Container();
    this.pileBadgeLayer = new Container();
    this.pileBadges = new Map();
    this.transient = new Container();
    this.dropCue = new Graphics();
    this.transient.addChild(this.dropCue);
    this.effects = new Container();
    this.root.addChild(this.background, this.feltMaterial, this.woodMaterial, this.woodMask, this.zones, this.lighting, this.slotLayer, this.cardLayer, this.pileBadgeLayer, this.transient, this.effects);
    this.app.stage.addChild(this.root);
    this.cardStore = new RetainedCardStore();
    this.cards = this.cardStore.items;
    this.positions = new Map();
    this.targets = [];
    this.current = null;
    this.renderedCurrent = null;
    this.selection = null;
    this.pending = false;
    this.drag = null;
    this.lastTap = null;
    this.suppressTapUntil = 0;
    this.transitions = new TransitionController();
    this.cardRedraws = 0;
    this.slotRebuilds = 0;
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
      localFaceDownCount:localProfile.faceDownCount,opponentFaceDownCount:opponentProfile.faceDownCount,
      stockSide:this.stockSide
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

  transitionDuration(source, force, cardId, placement, handoffAccepted = false) {
    if (source !== 'ack' || force || this.readOnly) return 0;
    if (this.dropHandoff) return 0;
    return motionProfileFor(placement).duration * BoardScene.prototype.motionScale.call(this);
  }

  motionScale() { return this.rendererPreference === 'canvas' ? 0 : this.quality.motionScale; }

  updateCard(view, placement, neutralInteraction = false) {
    const redrawn=view.update(placement.card, placement.width, placement.height, placement.compact, {
      selected: !neutralInteraction&&this.selection?.cardIds?.includes(placement.card.cardId),
      pending: !neutralInteraction&&this.pending&&this.selection?.cardIds?.includes(placement.card.cardId),
      shadows:this.quality.shadows
    });
    if(redrawn)this.cardRedraws+=1;
  }

  animateHover(view, active) {
    const base=this.positions.get(view.cardId);
    if(!base||this.drag||this.motionScale()===0)return;
    const fromLift=view.hoverLift||0,toLift=active?4:0,fromScale=view.scale.x||1,toScale=active?1.018:1;
    this.transitions.tween(`hover:${view.cardId}`,TOKENS.motion.hover*this.motionScale(),({eased})=>{
      view.hoverLift=fromLift+(toLift-fromLift)*eased;
      const scale=fromScale+(toScale-fromScale)*eased;
      view.position.set(base.x,base.y-view.hoverLift); view.scale.set(scale);
    },()=>{view.hoverLift=toLift;});
  }

  showDropCue(target, source) {
    this.dropCue.clear();
    const samePile=target?.zone==='tableau'&&source?.zone==='tableau'&&target.index===source.pileIndex;
    if(!target||samePile)return;
    const inset=3,radius=Math.max(7,this.layout.card.width*.08);
    this.dropCue.roundRect(target.x-inset,target.y-inset,target.width+inset*2,target.height+inset*2,radius)
      .fill({color:TOKENS.colors.amber,alpha:.045}).stroke({color:TOKENS.colors.brassLight,alpha:.72,width:2});
  }

  animateFlip(view, placement) {
    const duration=TOKENS.motion.flip*this.motionScale();
    if(duration===0){this.updateCard(view,placement);return;}
    let swapped=false;
    this.transitions.tween(`flip:${view.cardId}`,duration,({progress})=>{
      if(progress>=.5&&!swapped){swapped=true;this.updateCard(view,placement);}
      const fold=Math.max(.08,Math.abs(1-progress*2));
      view.scale.set(fold,1); view.position.set(placement.x+placement.width*(1-fold)*.5,placement.y);
    },()=>{if(!swapped)this.updateCard(view,placement);view.scale.set(1);view.position.set(placement.x,placement.y);});
  }

  drawBoard() {
    const signature=JSON.stringify(this.layout);
    if(this.boardSignature===signature)return;
    this.boardSignature=signature;
    const { width, height, zones, foundations, card, pad } = this.layout;
    this.background.clear().rect(0, 0, width, height).fill(TOKENS.colors.felt);
    for (let x = -height; x < width + height; x += 24) this.background.moveTo(x, 0).lineTo(x + height, height).stroke({ color: TOKENS.colors.feltLight, alpha: .022, width: 1 });
    if(this.feltMaterial.visible){
      this.feltMaterial.position.set(0,0); this.feltMaterial.width=width; this.feltMaterial.height=height; this.feltMaterial.alpha=.5;
    }
    const foundationInsetX=clamp(card.width*.14,8,15),foundationInsetY=clamp(card.height*.045,5,8);
    const foundationLeft=foundations[0].x-foundationInsetX,foundationRight=foundations.at(-1).x+card.width+foundationInsetX;
    const foundationTop=foundations[0].y-foundationInsetY,foundationWidth=foundationRight-foundationLeft,foundationHeight=card.height+foundationInsetY*2;
    this.woodMask.clear().roundRect(foundationLeft,foundationTop,foundationWidth,foundationHeight,12).fill(0xffffff);
    if(this.woodMaterial.visible){
      this.woodMaterial.position.set(foundationLeft,foundationTop); this.woodMaterial.width=foundationWidth; this.woodMaterial.height=foundationHeight; this.woodMaterial.alpha=.88;
    }
    this.zones.clear();
    roundedPanel(this.zones, pad * .35, pad * .28, width - pad * .7, zones.opponent.height - pad * .1, TOKENS.colors.feltLight, TOKENS.colors.woodLight, .055, 0);
    roundedPanel(this.zones, foundationLeft, foundationTop, foundationWidth, foundationHeight, TOKENS.colors.wood, TOKENS.colors.brass, this.woodMaterial.visible ? .18 : .72, .72);
    this.zones.roundRect(foundationLeft+3,foundationTop+3,foundationWidth-6,foundationHeight-6,9).stroke({color:TOKENS.colors.brassLight,alpha:.28,width:1});
    const rivetInset=clamp(card.width*.08,5,9),rivetRadius=clamp(card.width*.018,1.5,2.5);
    for(const [x,y] of [[foundationLeft+rivetInset,foundationTop+rivetInset],[foundationRight-rivetInset,foundationTop+rivetInset],[foundationLeft+rivetInset,foundationTop+foundationHeight-rivetInset],[foundationRight-rivetInset,foundationTop+foundationHeight-rivetInset]]) {
      this.zones.circle(x,y,rivetRadius).fill({color:TOKENS.colors.brassLight,alpha:.7}).stroke({color:TOKENS.colors.brassDark,alpha:.8,width:.8});
    }
    roundedPanel(this.zones, pad * .35, zones.local.y + pad * .15, width - pad * .7, zones.local.height - pad * .3, TOKENS.colors.feltLight, TOKENS.colors.woodLight, .1, 0);
    this.lighting.clear();
    this.lighting.ellipse(width*.5,foundationTop+foundationHeight*.45,width*.46,height*.24).fill({color:TOKENS.colors.amber,alpha:.018});
    this.lighting.ellipse(width*.5,height*.58,width*.34,height*.38).fill({color:TOKENS.colors.ivoryLight,alpha:.012});
    this.lighting.rect(0,0,width,height).stroke({color:0x020302,alpha:.08,width:clamp(Math.min(width,height)*.012,5,10)});
  }

  applyState(current, { source = 'snapshot', force = false } = {}) {
    this.current = current;
    const state = current.state;
    const localId = this.localId || 'p1';
    const deferAckRender=source==='ack'&&(this.drag?.active||(this.dropHandoff&&!handoffReachedState(this.dropHandoff,state,localId)));
    if(deferAckRender)return;
    const opponentId = localId === 'p1' ? 'p2' : 'p1';
    this.local = state.players[localId]; this.opponent = state.players[opponentId];
    const localProfile=this.stackProfile(this.local.tableau),opponentProfile=this.stackProfile(this.opponent.tableau,true);
    const nextLayout = computeLayout(this.layout.width, this.layout.height, {
      maxLocalCards:localProfile.count,maxOpponentCards:opponentProfile.count,
      localFaceDownCount:localProfile.faceDownCount,opponentFaceDownCount:opponentProfile.faceDownCount,
      stockSide:this.stockSide
    });
    this.layout = nextLayout; this.drawBoard(); this.drawSlots();
    const placements = this.collectPlacements(state, localId, opponentId);
    const handoffAccepted=source==='ack'&&handoffReachedTarget(this.dropHandoff,placements);
    const seen = new Set();
    for (const placement of placements) {
      seen.add(placement.card.cardId);
      const isNew = !this.cards.has(placement.card.cardId);
      const view = this.cardStore.getOrCreate(placement.card.cardId, () => new CardView(placement.card,this.courtTextures));
      if (isNew) {
        this.cardLayer.addChild(view);
        view.on('pointerdown', (event) => this.pointerDown(event, placement.card.cardId));
        view.on('pointertap', (event) => this.pointerTap(event, placement.card.cardId));
        view.on('pointerover', () => { if (view.meta?.interactive) this.animateHover(view,true); });
        view.on('pointerout', () => this.animateHover(view,false));
      }
      const previousCard=view.card;
      view.zIndex = placement.z;
      view.eventMode = placement.interactive ? 'static' : 'none'; view.cursor = placement.interactive ? 'pointer' : 'default';
      view.meta = placement;
      const previous = this.positions.get(placement.card.cardId) || { x: placement.x, y: placement.y };
      const holdingDrag=shouldHoldActiveDrag(source,this.drag,placement.card.cardId);
      const holdingHandoff=source==='ack'&&this.dropHandoff?.ids.includes(placement.card.cardId)&&!handoffAccepted;
      const duration = this.transitionDuration(source, force, placement.card.cardId, placement, handoffAccepted);
      const localHandoff=handoffAccepted&&this.dropHandoff?.ids.includes(placement.card.cardId);
      const turning = !isNew && previousCard?.faceDown && !placement.card.faceDown;
      const moving = duration > 0 && (previous.x !== placement.x || previous.y !== placement.y);
      const flipInPlace = shouldAnimateFlip({ wasFaceDown:previousCard?.faceDown, faceDown:placement.card.faceDown, moving, source, force, motionScale:this.readOnly?0:this.motionScale() });
      if(holdingDrag||holdingHandoff){
        this.transitions.cancel(`hover:${placement.card.cardId}`); this.updateCard(view,placement); view.zIndex=999;
        this.positions.set(placement.card.cardId,{x:placement.x,y:placement.y}); continue;
      }
      view.hoverLift=0; view.rotation=0; if(!localHandoff)view.scale.set(1);
      this.transitions.cancel(`hover:${placement.card.cardId}`);
      if(!flipInPlace)this.updateCard(view,placement,localHandoff);
      if (moving) {
        const profile=motionProfileFor(placement);
        this.transitions.move(placement.card.cardId, { x: view.x, y: view.y }, placement, duration, (p) => {
          const arc=Math.sin(Math.PI*p.progress),scale=1+arc*profile.scale;
          view.position.set(p.x,p.y-placement.height*profile.lift*arc); view.scale.set(scale);
        },()=>{view.alpha=1;view.scale.set(1);view.position.set(placement.x,placement.y);});
      } else if(flipInPlace) {
        view.position.set(placement.x,placement.y); this.animateFlip(view,placement);
      } else view.position.set(placement.x, placement.y);
      this.positions.set(placement.card.cardId, { x: placement.x, y: placement.y });
    }
    this.cardStore.prune(seen, (view, id) => { view.destroy({ children: true }); this.positions.delete(id); });
    this.cardLayer.sortableChildren = true; this.cardLayer.sortChildren();
    this.renderedCurrent = current;
    if (source === 'snapshot') this.transitions.cancelAndSnap(() => { for (const [id, p] of this.positions) this.cards.get(id)?.position.set(p.x, p.y); });
  }

  collectPlacements(state, localId, opponentId) {
    const result = []; const { card, local, opponent, foundations } = this.layout;
    const add = (cardData, p, meta) => result.push({ card: cardData, x: p.x, y: p.y, width: meta.compact ? card.compactWidth : card.width, height: meta.compact ? card.compactHeight : card.height, ...meta });
    const player = (data, geometry, owner, compact, interactive) => {
      const piled=(cards,origin,zone,baseZ)=>visiblePileCards(cards).forEach(({card:cardData,depth,isTop})=>{
        const offset=depth*(compact?1.25:2);
        add(cardData,{x:origin.x+offset,y:origin.y+offset},{owner,zone,compact,interactive:interactive&&isTop,z:baseZ-depth,cardIndex:cards.length-1-depth,pileCards:cards});
      });
      piled(data.stock,geometry.stock,'stock',compact?100:400);
      piled(data.waste,geometry.waste,'waste',compact?110:410);
      data.tableau.forEach((pile, index) => pilePositions(pile, geometry.tableau[index], geometry.fan).forEach((p, cardIndex) => add(pile[cardIndex], p, { owner, zone: 'tableau', pileIndex: index, cardIndex, pileCards: pile, compact, interactive, z: (compact ? 120 : 420) + index * 30 + cardIndex })));
    };
    player(state.players[opponentId], opponent, opponentId, true, false);
    state.foundations.forEach((foundation, index) => { if (foundation.cards.length) add(foundation.cards.at(-1), foundations[index], { owner: 'global', zone: 'foundation', pileIndex: index, compact: false, interactive: false, z: 300 + index }); });
    player(state.players[localId], local, localId, false, localId === this.localId && this.localId !== 'observer');
    return result;
  }

  drawSlots() {
    const { card, foundations, local, opponent } = this.layout;
    const signature=`${JSON.stringify(this.layout)}|selected:${Boolean(this.selection)}`;
    if(this.slotSignature!==signature){
      this.slotSignature=signature;
      this.slotRebuilds+=1;
      this.slotLayer.removeChildren().forEach((child) => child.destroy()); this.targets = [];
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
    const badge=(key,p,width,height,count,compact=false)=>{
      const label=String(count),badgeHeight=compact?17:21,badgeWidth=Math.max(compact?19:23,label.length*(compact?7:8)+10);
      let item=this.pileBadges.get(key);
      if(!item){
        const container=new Container(),surface=new Graphics(),text=new Text({text:'',style:{fontFamily:'Georgia',fontWeight:'700',fontSize:compact?11:13,fill:TOKENS.colors.ivoryLight}});
        text.anchor.set(.5);container.addChild(surface,text);container.eventMode='none';this.pileBadgeLayer.addChild(container);
        item={container,surface,text,shapeSignature:''};this.pileBadges.set(key,item);
      }
      const shapeSignature=`${badgeWidth}|${badgeHeight}`;
      if(item.shapeSignature!==shapeSignature){
        item.shapeSignature=shapeSignature;item.surface.clear().roundRect(0,0,badgeWidth,badgeHeight,badgeHeight/2).fill({color:0x160d08,alpha:.94}).stroke({color:TOKENS.colors.brass,alpha:.88,width:1.2});
        item.text.position.set(badgeWidth/2,badgeHeight/2-.5);
      }
      if(item.text.text!==label)item.text.text=label;
      item.container.position.set(p.x+width-badgeWidth*.72,p.y+5);
    };
    badge('opponent-stock',opponent.stock,card.compactWidth,card.compactHeight,this.opponent?.stock.length||0,true);
    badge('opponent-waste',opponent.waste,card.compactWidth,card.compactHeight,this.opponent?.waste.length||0,true);
    badge('local-stock',local.stock,card.width,card.height,this.local?.stock.length||0);
    badge('local-waste',local.waste,card.width,card.height,this.local?.waste.length||0);
  }

  setLocalId(id) { this.localId = id === 'observer' ? 'p1' : id; this.readOnly = id === 'observer'; }
  setStockSide(side) { this.stockSide=side==='right'?'right':'left'; if(this.current)this.applyState(this.current,{source:'snapshot',force:true}); else if(this.layout)this.resize(this.layout.width,this.layout.height); }
  setSelection(selection) { this.selection = selection; if (this.current) this.applyState(this.current, { source: 'local', force: true }); }
  setPending(value) { this.pending = value; if(value&&this.dropHandoff)return; if (this.current) this.applyState(this.current, { source: 'local', force: true }); }
  clearTransient() { this.drag = null; this.dropHandoff = null; this.selection = null; this.pending = false; this.lastTap = null; this.dropCue.clear(); this.transitions.cancelAndSnap(() => { for (const [id,p] of this.positions) { const view=this.cards.get(id); if(view){view.position.set(p.x,p.y);view.scale.set(1);view.rotation=0;view.hoverLift=0;} } }); }
  cancelInteraction() {
    const deferredCurrent=this.current!==this.renderedCurrent?this.current:null;
    const preserveActiveAlpha=this.dropHandoff?.source?.zone!=='waste';
    this.drag = null; this.dropHandoff = null; this.selection = null; this.pending = false; this.lastTap = null; this.dropCue.clear();
    for (const view of this.cards.values()) {
      const active=this.transitions.has(view.cardId)||this.transitions.has(`flip:${view.cardId}`)||this.transitions.has(`reject:${view.cardId}`);
      const activeAlpha=view.alpha;
      view.update(view.card, view.cardWidth, view.cardHeight, view.meta?.compact, { selected: false, pending: false, shadows:this.quality.shadows });
      if(active){if(preserveActiveAlpha)view.alpha=activeAlpha;}
      else{view.scale.set(1);view.rotation=0;view.hoverLift=0;}
    }
    if(deferredCurrent)this.applyState(deferredCurrent,{source:'snapshot',force:true});
  }
  rejectToAuthority() { const dragged = this.drag?.ids || this.dropHandoff?.ids || this.selection?.cardIds || []; this.dropCue.clear(); for (const id of dragged) { const view=this.cards.get(id), target=this.positions.get(id); if(view&&target) { const duration=TOKENS.motion.reject*this.motionScale(); if(duration===0){view.position.set(target.x,target.y);view.scale.set(1);continue;} const startScale=view.scale.x||1; this.transitions.move(`reject:${id}`,{x:view.x,y:view.y},target,duration,(p)=>{view.position.set(p.x,p.y);view.scale.set(startScale+(1-startScale)*p.eased);},()=>view.scale.set(1)); } } this.drag=null; this.dropHandoff=null; }

  celebrate() {
    const profile=celebrationProfileFor({rendererPreference:this.rendererPreference,qualityName:this.quality.name,prefersReducedMotion:this.prefersReducedMotion});
    this.stopCelebration?.();
    if(profile.mode!=='full'){
      const accent=new Graphics(),label=new Text({text:'FINALE!',style:{fontFamily:'Georgia',fontWeight:'700',fontSize:Math.max(34,Math.min(72,this.layout.width*.07)),fill:TOKENS.colors.ivoryLight,stroke:{color:TOKENS.colors.leatherDark,width:7},dropShadow:{color:0x000000,alpha:.65,blur:5,distance:3}}});
      const width=Math.min(520,this.layout.width*.72),height=Math.min(128,this.layout.height*.2),x=(this.layout.width-width)/2,y=this.layout.height*.3;
      accent.roundRect(x,y,width,height,18).fill({color:TOKENS.colors.leatherDark,alpha:.92}).stroke({color:TOKENS.colors.brassLight,alpha:.95,width:4});
      for(let index=0;index<18;index++){
        const px=x+24+(index*73)%(width-48),py=y-18-(index%4)*12,size=5+(index%3)*2;
        accent.poly([px,py-size,px+size*.65,py,px,py+size,px-size*.65,py]).fill({color:index%3===0?TOKENS.colors.amber:TOKENS.colors.brassLight,alpha:.92});
      }
      label.anchor.set(.5);label.position.set(this.layout.width*.5,y+height*.52);
      accent.alpha=profile.mode==='static'?1:0;
      label.alpha=accent.alpha;
      this.effects.addChild(accent,label);
      const cleanup=()=>{if(!accent.destroyed)accent.destroy();if(!label.destroyed)label.destroy();this.stopCelebration=null;};
      if(profile.mode==='static'){
        this.stopCelebration=cleanup;
        this.app.render();
        return profile;
      }
      let elapsed=0;
      const tick=(ticker)=>{
        elapsed+=ticker.deltaMS;
        const progress=Math.min(1,elapsed/1200),pulse=Math.sin(Math.PI*progress);
        accent.alpha=pulse;label.alpha=pulse;label.scale.set(.94+pulse*.08);label.y=y+height*.52-8*pulse;
        if(elapsed>=1200)this.stopCelebration?.();
      };
      this.stopCelebration=()=>{this.app.ticker.remove(tick);cleanup();};
      this.app.ticker.add(tick);
      return profile;
    }
    const palette=[TOKENS.colors.brassLight,TOKENS.colors.amber,0xd95446,0x76c98b,0xf3ead6];
    const confettiCount=this.rendererPreference==='canvas'?36:Math.max(36,this.quality.particles*2);
    const particles=[],effect=new Graphics();
    for(let index=0;index<confettiCount;index++){
      const width=4+(index%4),height=7+(index%3)*2;
      particles.push({kind:'confetti',color:palette[index%palette.length],width,height,x:(index*83)%this.layout.width,y:-12-(index%9)*16,vx:((index%11)-5)*.025,vy:.16+(index%7)*.025,gravity:.00016});
    }
    const bursts=[{x:.23,y:.34},{x:.5,y:.25},{x:.77,y:.36}];
    const burstCount=this.rendererPreference==='canvas'?12:22;
    bursts.forEach((burst,burstIndex)=>Array.from({length:burstCount},(_,index)=>{
      const angle=(Math.PI*2*index)/burstCount,speed=.12+(index%5)*.016;
      particles.push({kind:'spark',color:palette[(index+burstIndex)%palette.length],radius:2.1+(index%3)*.6,x:this.layout.width*burst.x,y:this.layout.height*burst.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,gravity:.00009});
    }));
    this.effects.addChild(effect);
    let elapsed=0;
    const tick=(ticker)=>{
      elapsed+=ticker.deltaMS;
      effect.clear();
      for(const particle of particles){
        particle.vy+=particle.gravity*ticker.deltaMS;particle.x+=particle.vx*ticker.deltaMS;particle.y+=particle.vy*ticker.deltaMS;
        const burst=particle.kind==='spark',alpha=Math.max(0,1-Math.max(0,elapsed-(burst?850:1500))/(burst?1000:1100));
        if(burst)effect.circle(particle.x,particle.y,particle.radius).fill({color:particle.color,alpha});
        else effect.rect(particle.x-particle.width/2,particle.y-particle.height/2,particle.width,particle.height).fill({color:particle.color,alpha});
      }
      if(elapsed>2700)this.stopCelebration?.();
    };
    this.stopCelebration=()=>{this.app.ticker.remove(tick);if(!effect.destroyed)effect.destroy();this.stopCelebration=null;};
    this.app.ticker.add(tick); return profile;
  }

  diagnostics() {
    const renderer=this.app.renderer;
    return { width:Math.round(this.layout?.width||0),height:Math.round(this.layout?.height||0),cardWidth:Math.round(this.layout?.card.width||0),cardHeight:Math.round(this.layout?.card.height||0),resolution:renderer.resolution,rendererName:this.rendererPreference,tickerStarted:this.app.ticker.started,tickerMaxFps:this.tickerMaxFps,cardRedraws:this.cardRedraws,slotRebuilds:this.slotRebuilds };
  }

  pointerTap(event, id) {
    if(shouldSuppressPostDragTap(performance.now(),this.suppressTapUntil)){this.suppressTapUntil=0;return;}
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
    if (this.drag.active) {
      for (const id of this.drag.ids) { const view=this.cards.get(id), origin=this.drag.offsets.get(id); if(view&&origin) { view.position.set(origin.x+dx,origin.y+dy); view.scale.set(this.motionScale()===0?1:1.025); view.zIndex=999; } }
      this.showDropCue(nearestDropTarget(this.targets,event.global,this.layout.card),this.drag.source);
    }
  }

  pointerUp(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const drag=this.drag; this.drag=null; this.dropCue.clear(); if (!drag.active) return;
    this.suppressTapUntil=performance.now()+250;
    const target=nearestDropTarget(this.targets,event.global,this.layout.card);
    const samePile=target?.zone==='tableau'&&drag.source.zone==='tableau'&&target.index===drag.source.pileIndex;
    if (target&&!samePile) { this.dropHandoff={ids:[...drag.ids],source:drag.source,target:{zone:target.zone,index:target.index}}; const sent=this.callbacks.onTarget?.({ zone:target.zone,index:target.index }); if(sent===false){this.dropHandoff=null;this.rejectToAuthority();} } else this.rejectToAuthority();
  }

  destroy() { this.stopCelebration?.(); this.transitions.cancelAndSnap(); this.root.destroy({ children: true }); }
}
