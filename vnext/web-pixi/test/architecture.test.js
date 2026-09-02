import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RetainedCardStore } from '../src/render/retained-card-store.js';
import { InputLock } from '../src/input/input-lock.js';
import { resolveQuality } from '../src/theme/tokens.js';
import { TransitionController } from '../src/animation/transition-controller.js';
import { BoardScene, handoffReachedState, handoffReachedTarget, motionProfileFor, placementMatchesHandoffTarget, shouldAnimateFlip, shouldHoldActiveDrag, shouldSuppressPostDragTap, visiblePileCards } from '../src/render/board-scene.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('retained display store reuses stable card ids and prunes missing cards',()=>{
  const store=new RetainedCardStore(); let creates=0, removed=0;
  const first=store.getOrCreate('d0:C:1',()=>({n:++creates})); const second=store.getOrCreate('d0:C:1',()=>({n:++creates}));
  assert.equal(first,second); assert.equal(creates,1);
  store.prune(new Set(),()=>removed++); assert.equal(store.items.size,0); assert.equal(removed,1);
});

test('overlay and pending reasons independently lock canvas input',()=>{
  const lock=new InputLock(); lock.lock('overlay'); lock.lock('pending'); lock.unlock('overlay'); assert.equal(lock.locked,true); lock.unlock('pending'); assert.equal(lock.locked,false);
});

test('quality profiles and reduced motion are deterministic',()=>{
  assert.equal(resolveQuality('high',false).resolutionCap,2); assert.equal(resolveQuality('high',true).name,'reduced'); assert.equal(resolveQuality('reduced',false).particles,0);
});

test('snapshot cancellation clears transitions and snaps once',()=>{
  let time=0,updates=0,snaps=0; const transitions=new TransitionController({now:()=>time});
  transitions.move('card',{x:0,y:0},{x:10,y:20},100,()=>updates++); time=40; transitions.tick(); assert.equal(updates,1);
  transitions.cancelAndSnap(()=>snaps++); time=100; transitions.tick(); assert.equal(transitions.size,0); assert.equal(snaps,1); assert.equal(updates,1);
});

test('generic tweens expose linear and eased progress',()=>{
  let time=0,last; const transitions=new TransitionController({now:()=>time});
  transitions.tween('flip',100,(value)=>last=value); time=50; transitions.tick();
  assert.equal(last.progress,.5); assert.ok(last.eased>.5);
});

test('new client imports shared protocol and intent modules and contains no core rules',()=>{
  const source=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
  assert.match(source,/\.\.\/\.\.\/web\/protocol-client\.mjs/); assert.match(source,/\.\.\/\.\.\/web\/intent-mapping\.mjs/);
  assert.doesNotMatch(source,/vnext\/core|applyAction|GAME_RULES|initMatch/);
});

test('server has disjoint legacy and Pixi static roots',()=>{
  const source=fs.readFileSync(path.resolve(root,'../server/index.js'),'utf8');
  assert.match(source,/PIXI_WEB_ROOT/); assert.match(source,/url\.pathname === '\/vnext\/pixi'/); assert.match(source,/url\.pathname\.startsWith\('\/vnext\/web'\)/);
});

test('score names, board debug overlay and finale preview stay wired',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const source=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
  const boardShell=html.match(/<section id="board-shell"[\s\S]*?<\/section>/)?.[0] ?? '';

  assert.match(html,/id="p1-name"/); assert.match(html,/id="p2-name"/);
  assert.doesNotMatch(html,/id="hud-toggle"/);
  assert.match(boardShell,/id="debug-hud"/);
  assert.match(source,/board\.celebrate\(\{force:true\}\)/);
});

test('retina resolution never shrinks the logical board layout',()=>{
  const source=fs.readFileSync(path.join(root,'src/render/board-scene.js'),'utf8');
  const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');

  assert.doesNotMatch(source,/renderer\.(?:width|height)\s*\/\s*(?:this\.app\.)?renderer\.resolution/);
  assert.match(source,/computeLayout\(this\.layout\.width, this\.layout\.height/);
  assert.match(main,/new ResizeObserver/);
});

test('drag handoff survives pending state until the authoritative ack',()=>{
  let applies=0;
  const card={alpha:1};
  const scene={pending:false,dropHandoff:{ids:['card']},cards:new Map([['card',card]]),current:{},applyState:()=>applies++};
  BoardScene.prototype.setPending.call(scene,true);
  assert.equal(scene.pending,true);
  assert.equal(card.alpha,1);
  assert.equal(applies,0);
});

test('authoritative ack adds no animation after a local drag is released',()=>{
  const scene={dropHandoff:{ids:['dragged'],source:{zone:'tableau',pileCards:[{cardId:'bystander'},{cardId:'dragged'}]}},quality:{motionScale:1}};
  assert.equal(BoardScene.prototype.transitionDuration.call(scene,'ack',false,'dragged',{},true),0);
  assert.equal(BoardScene.prototype.transitionDuration.call(scene,'ack',false,'bystander',{},true),0);
  assert.equal(BoardScene.prototype.transitionDuration.call(scene,'ack',false,'dragged',{},false),0);
  scene.dropHandoff=null;
  assert.equal(BoardScene.prototype.transitionDuration.call(scene,'ack',false,'clicked'),220);
  assert.equal(BoardScene.prototype.transitionDuration.call(scene,'snapshot',false,'clicked'),0);
});

test('waste drag and depth cards add no post-release animation',()=>{
  const scene={dropHandoff:{ids:['top'],source:{zone:'waste',pileCards:[{cardId:'under'},{cardId:'top'}]}},quality:{motionScale:1}};
  assert.equal(BoardScene.prototype.transitionDuration.call(scene,'ack',false,'top',{},true),0);
  assert.equal(BoardScene.prototype.transitionDuration.call(scene,'ack',false,'under',{},true),0);
  assert.equal(BoardScene.prototype.transitionDuration.call(scene,'ack',false,'tableau-card',{},true),0);
});

test('an unrelated ack cannot complete or replay a pending drag handoff',()=>{
  const handoff={ids:['top'],target:{zone:'tableau',index:3}};
  const stillInWaste=[{card:{cardId:'top'},zone:'waste'}];
  const atTarget=[{card:{cardId:'top'},zone:'tableau',pileIndex:3}];
  assert.equal(handoffReachedTarget(handoff,stillInWaste),false);
  assert.equal(handoffReachedTarget(handoff,atTarget),true);
  assert.equal(placementMatchesHandoffTarget({...atTarget[0],pileIndex:2},handoff.target),false);
  assert.equal(placementMatchesHandoffTarget({card:{cardId:'ace'},zone:'foundation',pileIndex:6},{zone:'foundation',index:2}),true);
});

test('an ack cannot reset a card while its pointer drag is still active',()=>{
  const drag={active:true,ids:['dragged']};
  assert.equal(shouldHoldActiveDrag('ack',drag,'dragged'),true);
  assert.equal(shouldHoldActiveDrag('ack',{...drag,active:false},'dragged'),false);
  assert.equal(shouldHoldActiveDrag('snapshot',drag,'dragged'),false);
  assert.equal(shouldHoldActiveDrag('ack',drag,'other'),false);
});

test('handoff state matching defers unrelated acks without laying out the board',()=>{
  const handoff={ids:['dragged'],target:{zone:'tableau',index:2}};
  const state={players:{p1:{tableau:[[],[],[{cardId:'dragged'}]]}},foundations:[]};
  assert.equal(handoffReachedState(handoff,state,'p1'),true);
  assert.equal(handoffReachedState({...handoff,target:{zone:'tableau',index:1}},state,'p1'),false);
  state.players.p1.tableau[2]=[]; state.foundations=[{suit:'C',cards:[{cardId:'d0:C:1'},{cardId:'dragged'}]}];
  assert.equal(handoffReachedState({...handoff,target:{zone:'foundation',index:0}},state,'p1'),true);
});

test('a waste club two ack completes its drag handoff on top of the club ace',()=>{
  const handoff={ids:['d0:C:2'],source:{zone:'waste'},target:{zone:'foundation',index:0}};
  const state={players:{p1:{tableau:[]}},foundations:[
    {suit:'C',cards:[{cardId:'d0:C:1',rank:1},{cardId:'d0:C:2',rank:2}]},
    {suit:'C',cards:[]}
  ]};
  assert.equal(handoffReachedState(handoff,state,'p1'),true);
});

test('active and pending drags return before the expensive board redraw',()=>{
  const source=fs.readFileSync(path.join(root,'src/render/board-scene.js'),'utf8');
  const guard=source.indexOf('if(deferAckRender)return;');
  assert.ok(guard>source.indexOf('this.current = current;'));
  assert.ok(guard<source.indexOf('this.drawBoard(); this.drawSlots();',guard));
});

test('the synthetic tap immediately following a drag is consumed once',()=>{
  assert.equal(shouldSuppressPostDragTap(1000,1250),true);
  assert.equal(shouldSuppressPostDragTap(1250,1250),false);
  assert.equal(shouldSuppressPostDragTap(1300,1250),false);
});

test('finishing a pending drag keeps its alpha under transition control',()=>{
  const view={cardId:'dragged',alpha:.82,card:{},cardWidth:80,cardHeight:114,meta:{compact:false},hoverLift:0,
    update(){this.alpha=1;},scale:{set(){}},rotation:0};
  const scene={drag:{},dropHandoff:{ids:['dragged']},selection:{},pending:true,lastTap:{},dropCue:{clear(){}},
    cards:new Map([['dragged',view]]),transitions:{has:(id)=>id==='dragged'},quality:{shadows:true}};
  BoardScene.prototype.cancelInteraction.call(scene);
  assert.equal(view.alpha,.82);
});

test('a waste drag restores full opacity without a second fade animation',()=>{
  const view={cardId:'dragged',alpha:.82,card:{},cardWidth:80,cardHeight:114,meta:{compact:false},hoverLift:0,
    update(){this.alpha=1;},scale:{set(){}},rotation:0};
  const scene={drag:{},dropHandoff:{ids:['dragged'],source:{zone:'waste'}},selection:{},pending:true,lastTap:{},dropCue:{clear(){}},
    cards:new Map([['dragged',view]]),transitions:{has:(id)=>id==='dragged'},quality:{shadows:true}};
  BoardScene.prototype.cancelInteraction.call(scene);
  assert.equal(view.alpha,1);
});

test('drag handoff has no tween, opacity pulse or scale wobble',()=>{
  const source=fs.readFileSync(path.join(root,'src/render/board-scene.js'),'utf8');
  assert.match(source,/if\(value&&this\.dropHandoff\)return/);
  assert.match(source,/if \(this\.dropHandoff\) return 0/);
  assert.doesNotMatch(source,/keepAboveTarget|fadePending/);
  assert.doesNotMatch(source,/settling\?startScale/);
});

test('stock and waste retain three visible depth cards with one interactive top',()=>{
  const cards=Array.from({length:5},(_,index)=>({cardId:`c${index}`}));
  const visible=visiblePileCards(cards);
  assert.deepEqual(visible.map((item)=>item.card.cardId),['c2','c3','c4']);
  assert.deepEqual(visible.map((item)=>item.depth),[2,1,0]);
  assert.equal(visible.filter((item)=>item.isTop).length,1);
});

test('motion profiles give foundation moves more weight than tableau moves',()=>{
  const tableau=motionProfileFor({zone:'tableau'}),foundation=motionProfileFor({zone:'foundation'});
  assert.ok(foundation.duration>tableau.duration);
  assert.ok(foundation.lift>tableau.lift);
});

test('reduced motion keeps ack and flip transitions instantaneous',()=>{
  const scene={dropHandoff:null,quality:{motionScale:0}};
  assert.equal(BoardScene.prototype.transitionDuration.call(scene,'ack',false,'card',{zone:'foundation'}),0);
  assert.equal(shouldAnimateFlip({wasFaceDown:true,faceDown:false,moving:false,source:'ack',force:false,motionScale:0}),false);
});

test('only an in-place authoritative reveal uses the flip animation',()=>{
  const base={wasFaceDown:true,faceDown:false,moving:false,source:'ack',force:false,motionScale:1};
  assert.equal(shouldAnimateFlip(base),true);
  assert.equal(shouldAnimateFlip({...base,source:'snapshot'}),false);
  assert.equal(shouldAnimateFlip({...base,moving:true}),false);
});

test('board zones omit the P1 divider and P2 outline',()=>{
  const source=fs.readFileSync(path.join(root,'src/render/board-scene.js'),'utf8');
  assert.doesNotMatch(source,/moveTo\(pad \* 2, zones\.local\.y\)/);
  assert.match(source,/TOKENS\.colors\.woodLight, \.055, 0\)/);
  assert.match(source,/TOKENS\.colors\.woodLight, \.1, 0\)/);
});

test('felt reaches the rounded brass board edge and vintage header ornaments stay present',()=>{
  const css=fs.readFileSync(path.join(root,'src/styles.css'),'utf8');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(css,/#pixi-stage \{[^}]*overflow:hidden;[^}]*border-radius:48px/);
  assert.match(css,/\.table-frame \{[^}]*padding:16px;[^}]*table-bronze-v1\.png/);
  assert.match(css,/\.corner-hardware \{[^}]*width:46px;[^}]*height:46px/);
  assert.match(css,/\.corner-hardware::after \{[^}]*width:11px;[^}]*radial-gradient/);
  assert.equal((html.match(/class="corner-hardware /g)||[]).length,4);
  assert.doesNotMatch(css,/#e4bd62|#e1b55f/);
  assert.match(css,/\.topbar, \.statusbar \{[^}]*border: 0/);
  assert.match(css,/\.topbar::after/);
  assert.match(css,/\.brand strong::before/);
});

test('Pixi bot menu uses the human-facing difficulty profiles',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const select=html.match(/<select id="bot-speed">[\s\S]*?<\/select>/)?.[0] ?? '';

  assert.match(select,/value="easy">Easy/);
  assert.match(select,/value="medium" selected>Mittel/);
  assert.match(select,/value="hard">Schwer/);
  assert.doesNotMatch(select,/value="(?:slow|normal|fast)"/);
});

test('card artwork uses local original court art with a procedural fallback',()=>{
  const source=fs.readFileSync(path.join(root,'src/render/board-scene.js'),'utf8');
  const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
  assert.match(source,/function drawSuit/);
  assert.match(source,/function drawCardBack/);
  assert.match(source,/PIP_LAYOUTS/);
  assert.match(source,/createCourtTextures/);
  assert.match(main,/court-figures-v1\.png\?url/);
  assert.doesNotMatch(`${source}\n${main}`,/https?:\/\//);
});

test('table materials are local assets with procedural color fallbacks',()=>{
  const source=fs.readFileSync(path.join(root,'src/render/board-scene.js'),'utf8');
  const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
  assert.match(main,/table-felt-v1\.png\?url/);
  assert.match(main,/table-walnut-v1\.png\?url/);
  assert.match(source,/this\.woodMaterial\.mask=this\.woodMask/);
  assert.match(source,/this\.pileBadgeLayer/);
  assert.match(source,/TOKENS\.colors\.felt/);
  assert.doesNotMatch(`${source}\n${main}`,/https?:\/\//);
});
