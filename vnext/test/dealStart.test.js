'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MatchSession } = require('../server/matchSession');
const { PROTOCOL_VERSION } = require('../core');
const { shouldReserveProgress } = require('../bot/strategy');
const action = session => ({matchId:session.matchId,clientId:'p1',protocolVersion:PROTOCOL_VERSION,
  seq:0,baseRev:0,kind:'draw',payload:{source:{zone:'stock',owner:'p1'},target:{zone:'waste',owner:'p1'}}});

for (const mode of ['split','shared']) test(`deal barrier preserves state, sequence and full clock: ${mode}`, () => {
  let now = 1000;
  const s = new MatchSession({matchId:'deal',seed:'DEAL',mode,progressLimitMinutes:2,dealDurationMs:1800,now:()=>now});
  const before = structuredClone(s.current);
  assert.equal(s.progressClock().running,false);
  for(now=1000;now<2800;now+=100) {
    assert.equal(s.process('p1',action(s)).response.reason,'DEALING');
    assert.deepEqual(s.current,before);
    assert.equal(s.steps.length,0);
    assert.equal(s.lastAcceptedSeq.p1,-1);
  }
  assert.equal(s.finishDealIfDue().reason,'DEAL_READY');
  assert.equal(s.progressClock().deadlines.p1,122800);
  assert.equal(s.process('p1',action(s)).response.kind,'ack');
  const restart=s.restart({clockActive:true});
  assert.notEqual(restart.progressClock.dealId,'deal:1');
  assert.equal(restart.progressClock.running,false);
  assert.equal(s.process('p1',action(s)).response.reason,'DEALING');
});

test('waiting lobby starts deal only when activated, also without progress clock', () => {
  let now=0;
  const s=new MatchSession({matchId:'waiting',seed:'DEAL',mode:'split',clockActive:false,dealDurationMs:1800,now:()=>now});
  assert.equal(s.dealEndsAt,null);
  now=100000; s.activateClock();
  assert.equal(s.dealEndsAt,101800);
  const current={...s.current,progressClock:s.progressClock(),clockReceivedAt:now};
  assert.equal(shouldReserveProgress(current,'p1',[],'easy',now),true);
  assert.equal(shouldReserveProgress(current,'p1',[],'hard',now+1800),false);
  now+=1800; assert.equal(s.finishDealIfDue().reason,'DEAL_READY');
  assert.equal(s.progressClock().enabled,false);
});
