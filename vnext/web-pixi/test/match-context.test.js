import test from 'node:test';
import assert from 'node:assert/strict';
import { gameForMatch, guestSessionCandidate, interactionAllowed, retryableSequenceReject, sameTableauSelection, waitingMatchMessage } from '../src/bridge/match-context.js';

const current={state:{status:'active'}};

test('waiting lobby blocks input while direct and active bot matches remain playable',()=>{
  assert.equal(interactionAllowed({locked:false,current,role:'p1',lobbyStatus:'waiting'}),false);
  assert.equal(interactionAllowed({locked:false,current,role:'p1',lobbyStatus:null}),true);
  assert.equal(interactionAllowed({locked:false,current,role:'p1',lobbyStatus:'active'}),true);
});

test('observer, overlay and finished state block input',()=>{
  assert.equal(interactionAllowed({locked:false,current,role:'observer',lobbyStatus:null}),false);
  assert.equal(interactionAllowed({locked:true,current,role:'p1',lobbyStatus:null}),false);
  assert.equal(interactionAllowed({locked:false,current:{state:{status:'finished'}},role:'p1',lobbyStatus:null}),false);
});

test('match context resolves exact lobby match and explains the waiting roles',()=>{
  const game={matchId:'m-2',status:'waiting'};
  assert.equal(gameForMatch([{matchId:'m-1'},game],'m-2'),game);
  assert.equal(gameForMatch([], 'm-2'),null);
  assert.match(waitingMatchMessage('p1'),/Warte auf P2/);
  assert.match(waitingMatchMessage('p2'),/Lobby-Spiel/);
});

test('rapid repeat click identifies the selected tableau instead of targeting itself',()=>{
  const selection={source:{zone:'tableau',owner:'p1',index:3},count:1,cardIds:['d0:H:1']};
  assert.equal(sameTableauSelection(selection,{zone:'tableau',pileIndex:3}),true);
  assert.equal(sameTableauSelection(selection,{zone:'tableau',pileIndex:4}),false);
  assert.equal(sameTableauSelection({source:{zone:'waste',owner:'p1'}},{zone:'tableau',pileIndex:3}),false);
});

test('P2 uses a per-match guest session when the persistent identity owns P1',()=>{
  const game={players:{p1:{sessionId:'host-session'}}};
  assert.equal(guestSessionCandidate({game,persistentSessionId:'host-session',matchSessionId:null}),null);
  assert.equal(guestSessionCandidate({game,persistentSessionId:'other-session',matchSessionId:null}),'other-session');
  assert.equal(guestSessionCandidate({game,persistentSessionId:'host-session',matchSessionId:'guest-session'}),'guest-session');
});

test('only duplicate sequence rejects with an expected sequence are retried',()=>{
  assert.equal(retryableSequenceReject({kind:'reject',code:'DUPLICATE_SEQ',expectedSeq:11}),true);
  assert.equal(retryableSequenceReject({kind:'reject',code:'RULE_VIOLATION'}),false);
  assert.equal(retryableSequenceReject({kind:'ack',expectedSeq:11}),false);
});
