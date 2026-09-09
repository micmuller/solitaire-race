'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateCandidate, rankCandidates, shouldReserveProgress } = require('../bot/strategy');
const { generateActionCandidates } = require('../bot/actionGenerator');
const { initMatch } = require('../core');
const { BotActor } = require('../bot/runner');

const card = (suit, rank, faceDown = false) => ({ suit, rank, faceDown, cardId: `${suit}${rank}` });
function fixture() {
  return { rev: 1, state: { seed: 'strategy', status: 'active',
    players: {
      p1: { stock: [card('C', 2, true)], waste: [card('C', 1)],
        tableau: [[card('H', 9, true), card('H', 6)], [card('S', 7)], [], [], [], [], []] },
      p2: { stock: [], waste: [], tableau: [[], [], [], [], [], [], []] }
    }, foundations: ['C','D','H','S','C','D','H','S'].map(suit => ({ suit, cards: [] })) } };
}
test('medium prefers uncovering to a routine waste placement', () => {
  const current = fixture();
  current.state.players.p1.waste = [card('H',8)];
  current.state.players.p1.tableau[2] = [card('S',9)];
  const candidates = generateActionCandidates(current, 'p1');
  assert.equal(rankCandidates(current, 'p1', candidates, 'easy')[0].payload.source.zone, 'waste');
  assert.equal(rankCandidates(current, 'p1', candidates, 'medium')[0].payload.source.index, 0);
});
test('hard accounts for a newly opened opponent foundation opportunity', () => {
  const current = fixture();
  current.state.players.p1.waste = [];
  current.state.players.p1.tableau = [[card('D',12)], [card('C',11)], [], [], [], [], []];
  current.state.players.p2.waste = [card('D',13)];
  current.state.foundations[0].cards = [card('C',10)];
  current.state.foundations[1].cards = [card('D',11)];
  const candidates = generateActionCandidates(current, 'p1');
  const diamond = candidates.find(c => c.kind === 'foundationMove' && c.payload.source.index === 0);
  assert.equal(evaluateCandidate(current,'p1',diamond,'medium'), 84);
  assert.equal(evaluateCandidate(current,'p1',diamond,'hard'), 80);
  assert.equal(rankCandidates(current,'p1',candidates,'medium')[0], diamond);
  assert.equal(rankCandidates(current,'p1',candidates,'hard')[0].payload.source.index, 1);
});
test('hidden identities and stock ordering cannot affect strategy ranking', () => {
  for (const mode of ['split','shared']) for (const difficulty of ['easy','medium','hard']) {
    const current = initMatch('STRATEGY-HIDDEN', mode);
    const before = rankCandidates(current,'p1',generateActionCandidates(current,'p1'),difficulty);
    const changed = structuredClone(current);
    for (const p of Object.values(changed.state.players)) {
      p.stock.reverse();
      for (const c of [...p.stock, ...p.tableau.flat()].filter(c=>c.faceDown)) {
        c.rank = 13; c.suit = 'H'; c.cardId = 'secret-changed';
      }
    }
    assert.deepEqual(rankCandidates(changed,'p1',generateActionCandidates(changed,'p1'),difficulty),before);
    assert.deepEqual(rankCandidates(current,'p1',generateActionCandidates(current,'p1'),difficulty),before);
  }
});
test('hard values an already visible next foundation card without mutating state', () => {
  const current = fixture();
  current.state.players.p1.waste = [card('C',2),card('C',1)];
  const candidate = generateActionCandidates(current,'p1').find(c=>c.kind==='foundationMove');
  const saved = structuredClone(current);
  assert.equal(evaluateCandidate(current,'p1',candidate,'hard') - evaluateCandidate(current,'p1',candidate,'medium'),20);
  assert.deepEqual(current,saved);
});

test('new progress releases old tableau route bans and rejected states stay bounded', () => {
  const current = fixture();
  current.stateHash = 'one';
  const actor = new BotActor({client:{current, clientId:'p1'},difficulty:'medium'});
  actor.nextCandidate();
  const move = generateActionCandidates(current,'p1').find(c=>c.kind==='tableauMove');
  actor.rememberAccepted(move);
  actor.nextCandidate();
  assert.equal(actor.recentAccepted.length,1);
  current.state.foundations[0].cards.push(card('C',1));
  current.rev++; current.stateHash='two';
  actor.nextCandidate();
  assert.equal(actor.recentAccepted.length,0);
  for(let i=0;i<100;i++) {current.rev++; actor.rejectedSet();}
  assert.equal(actor.rejectedByState.size,1);
});

test('medium and hard draw instead of shuffling a whole king column between empty slots', () => {
  const current=fixture();
  current.state.players.p1.waste=[];
  current.state.players.p1.tableau=[[card('S',13)],[],[],[],[],[],[]];
  const candidates=generateActionCandidates(current,'p1');
  for(const level of ['medium','hard']) assert.equal(rankCandidates(current,'p1',candidates,level)[0].kind,'draw');
});

test('Node and Pixi choose identical intents for all difficulties including Unicode seeds', async () => {
  const { VisualBotController } = await import('../web-pixi/src/bot/visual-bot-controller.js');
  for (const mode of ['split','shared']) for(const seed of ['parity','Grüezi-🃏']) {
    const current=initMatch(seed,mode);
    for(const level of ['easy','medium','hard']) {
      const node=new BotActor({client:{current,clientId:'p1'},difficulty:level});
      const pixi=new VisualBotController({getCurrent:()=>current,sendIntent:async()=>{},speed:level});
      assert.deepEqual(node.nextCandidate(),pixi.nextCandidate(current));
    }
  }
});

test('clock never blocks natural play', () => {
  const current=fixture();
  current.state.players.p1.tableau=[[],[],[],[],[],[],[]];
  current.clockReceivedAt=1000;
  current.progressClock={enabled:true,running:true,serverNow:4000,deadlines:{p1:124000,p2:124000}};
  const candidates=generateActionCandidates(current,'p1');
  assert.equal(shouldReserveProgress(current,'p1',candidates,'easy',1000),false);
  assert.equal(shouldReserveProgress(current,'p1',candidates,'medium',1000),false);
  assert.equal(shouldReserveProgress(current,'p1',candidates,'medium',91000),false);
  assert.equal(shouldReserveProgress(current,'p1',candidates,'hard',91000),false);
  assert.equal(shouldReserveProgress(current,'p1',candidates,'hard',109000),false);
  current.state.players.p1.stock=[];
  assert.equal(shouldReserveProgress(current,'p1',candidates,'hard',1000),false,'winning card is never held');
  current.progressClock.enabled=false;
  assert.equal(shouldReserveProgress(current,'p1',candidates,'hard',1000),false);
});

test('actor plays immediately despite a fresh clock', async () => {
  const current=fixture();
  current.state.players.p1.tableau=[[],[],[],[],[],[],[]];
  current.clockReceivedAt=0;
  current.progressClock={enabled:true,running:true,serverNow:0,deadlines:{p1:120000,p2:120000}};
  let now=0,sent=0;
  const actor=new BotActor({client:{current,clientId:'p1',sendIntent:async()=>{sent++;return {kind:'ack'};}},difficulty:'hard',now:()=>now});
  assert.equal((await actor.step()).status,'ACK');
  assert.equal(sent,1);
});
