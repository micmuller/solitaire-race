import test from 'node:test';
import assert from 'node:assert/strict';
import { dealPlan, dealFrame } from '../src/animation/deal-plan.js';
import { DEAL_PREVIEW } from '../src/assets/deal-preview.js';

test('preview contains two complete decks with a valid initial tableau shape', () => {
  const ids = [];
  for (const p of Object.values(DEAL_PREVIEW.state.players)) {
    assert.equal(p.stock.length, 24);
    assert.equal(p.waste.length, 0);
    p.tableau.forEach((pile, i) => {
      assert.equal(pile.length, i + 1);
      assert.equal(pile.filter(c => !c.faceDown).length, 1);
      assert.equal(pile.at(-1).faceDown, false);
    });
    ids.push(...p.stock, ...p.tableau.flat());
  }
  assert.equal(new Set(ids.map(c => c.cardId)).size, 104);
});

test('deal is row-wise, parallel from two stocks and completes within 1.5 seconds', () => {
  const placements = Object.entries(DEAL_PREVIEW.state.players).flatMap(([owner,p]) =>
    p.tableau.flatMap((pile,pileIndex) => pile.map((card,cardIndex) => ({owner,card,pileIndex,cardIndex,zone:'tableau'}))));
  const before = JSON.stringify(placements);
  const plan = dealPlan(placements, {p1:{x:1,y:2},p2:{x:3,y:4}});
  assert.equal(plan.length,56);
  for(const owner of ['p1','p2']) {
    const hand = plan.filter(p=>p.placement.owner===owner);
    assert.deepEqual(hand.slice(0,7).map(p=>p.placement.pileIndex),[0,1,2,3,4,5,6]);
    assert.equal(hand[0].delay,0);
    assert.ok(hand.at(-1).delay+hand.at(-1).duration<=1500);
  }
  assert.equal(JSON.stringify(placements),before);
});

test('delayed flights clamp to stock and exact final position', () => {
  assert.deepEqual(dealFrame(0,42,300),{progress:0,eased:0,started:false});
  assert.deepEqual(dealFrame(400,42,300),{progress:1,eased:1,started:true});
});
