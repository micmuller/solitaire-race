import test from 'node:test';
import assert from 'node:assert/strict';
import { gameForMatch, interactionAllowed, waitingMatchMessage } from '../src/bridge/match-context.js';

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
