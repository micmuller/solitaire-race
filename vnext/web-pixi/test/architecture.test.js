import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RetainedCardStore } from '../src/render/retained-card-store.js';
import { InputLock } from '../src/input/input-lock.js';
import { resolveQuality } from '../src/theme/tokens.js';
import { TransitionController } from '../src/animation/transition-controller.js';

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
