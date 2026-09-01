import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout, fanStep, FOUNDATION_SUITS, pilePositions } from '../src/layout/layout-engine.js';

for (const [width,height] of [[1024,670],[1440,786],[640,458]]) {
  test(`layout is complete at ${width}x${height}`,()=>{
    const layout=computeLayout(width,height,{maxLocalCards:14,maxOpponentCards:14});
    assert.equal(layout.local.tableau.length,7); assert.equal(layout.opponent.tableau.length,7);
    assert.equal(layout.foundations.length,8); assert.deepEqual(layout.foundations.map(x=>x.suit),FOUNDATION_SUITS);
    assert.ok(layout.card.width>=48); assert.ok(layout.local.tableau.at(-1).x+layout.card.width<=width+0.01);
    assert.ok(layout.foundations.at(-1).x+layout.card.width<=width+0.01);
  });
}

test('fourteen-card fan keeps final local card on board',()=>{
  const layout=computeLayout(1024,670,{maxLocalCards:14,maxOpponentCards:14});
  const cards=Array.from({length:14},(_,i)=>({faceDown:i<4}));
  const positions=pilePositions(cards,layout.local.tableau[0],layout.local.fan);
  assert.ok(positions.at(-1).y+layout.card.height<=670+0.01);
  assert.ok(layout.local.fan.faceUp>=10);
});

test('fan separates open cards more than hidden cards',()=>{
  const fan=fanStep({count:14,availableSpan:190,cardHeight:120,faceDownCount:5});
  assert.ok(fan.faceUp>fan.faceDown);
});

for (const [width,height] of [[1024,664],[1366,820]]) {
  test(`tableau piles use foundation spacing at ${width}x${height}`,()=>{
    const layout=computeLayout(width,height);
    const foundationGap=layout.foundations[1].x-layout.foundations[0].x-layout.card.width;
    const localGap=layout.local.tableau[1].x-layout.local.tableau[0].x-layout.card.width;
    const opponentGap=layout.opponent.tableau[1].x-layout.opponent.tableau[0].x-layout.card.compactWidth;
    assert.ok(Math.abs(localGap-foundationGap)<0.01);
    assert.ok(Math.abs(opponentGap-foundationGap)<0.01);
    assert.ok(layout.local.tableau[0].x>=layout.local.waste.x+layout.card.width);
    assert.ok(layout.local.tableau.at(-1).x+layout.card.width<=width-layout.pad+0.01);
  });
}
