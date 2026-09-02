import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RetainedCardStore } from '../src/render/retained-card-store.js';
import { InputLock } from '../src/input/input-lock.js';
import { resolveQuality } from '../src/theme/tokens.js';
import { TransitionController } from '../src/animation/transition-controller.js';
import { BoardScene } from '../src/render/board-scene.js';

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
  assert.equal(card.alpha,.82);
  assert.equal(applies,0);
});

test('authoritative ack does not animate a locally dragged card twice',()=>{
  const scene={dropHandoff:{ids:['dragged']},quality:{motionScale:1}};
  assert.equal(BoardScene.prototype.transitionDuration.call(scene,'ack',false,'dragged'),0);
  assert.equal(BoardScene.prototype.transitionDuration.call(scene,'ack',false,'clicked'),220);
  assert.equal(BoardScene.prototype.transitionDuration.call(scene,'snapshot',false,'clicked'),0);
});

test('board zones omit the P1 divider and P2 outline',()=>{
  const source=fs.readFileSync(path.join(root,'src/render/board-scene.js'),'utf8');
  assert.doesNotMatch(source,/moveTo\(pad \* 2, zones\.local\.y\)/);
  assert.match(source,/TOKENS\.colors\.woodLight, \.38, 0\)/);
  assert.match(source,/TOKENS\.colors\.woodLight, \.18, 0\)/);
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
