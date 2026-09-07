import test from 'node:test';
import assert from 'node:assert/strict';
import { VisualBotController, generateVisualBotCandidates, visualBotDelay } from '../src/bot/visual-bot-controller.js';

const card=(cardId,suit,rank,faceDown=false)=>({cardId,suit,rank,faceDown});
const current=()=>({
  rev:3,stateHash:'hash-3',state:{status:'active',seed:'visual-bot',foundations:[
    {suit:'C',cards:[]},{suit:'C',cards:[]},{suit:'D',cards:[]},{suit:'D',cards:[]},
    {suit:'H',cards:[]},{suit:'H',cards:[]},{suit:'S',cards:[]},{suit:'S',cards:[]}
  ],players:{
    p1:{stock:[card('stock','S',8,true)],waste:[card('ace','H',1)],tableau:Array.from({length:7},()=>[])},
    p2:{stock:[],waste:[],tableau:Array.from({length:7},()=>[])}
  }}
});

test('visual client bot prioritizes a foundation intent and stays deterministic',()=>{
  const first=generateVisualBotCandidates(current(),'p1');
  const second=generateVisualBotCandidates(current(),'p1');
  assert.deepEqual(first,second);
  assert.equal(first[0].kind,'foundationMove');
  assert.equal(first.at(-1).kind,'draw');
  assert.equal(visualBotDelay('medium',4,'p1'),visualBotDelay('medium',4,'p1'));
});

test('visual client bot waits for rendering before and after its acknowledged intent',async()=>{
  const events=[];
  const state=current();
  const controller=new VisualBotController({
    getCurrent:()=>state,
    speed:'hard',
    waitForVisualIdle:async()=>events.push('idle'),
    sendIntent:async(kind)=>{events.push(kind);state.state.status='finished';return {kind:'ack'};},
    onStop:()=>events.push('stop')
  });
  controller.wait=async()=>events.push('pace');
  await controller.start();
  assert.deepEqual(events,['pace','idle','foundationMove','idle','stop']);
});

test('stopping the visual client bot releases a pending pace wait without sending',async()=>{
  let sent=0;
  const controller=new VisualBotController({getCurrent:current,sendIntent:async()=>{sent+=1;}});
  const done=controller.start();
  controller.stop('uat stop');
  await done;
  assert.equal(sent,0);
  assert.equal(controller.running,false);
});

test('visual client bot skips rejected intents and continues after a recovery snapshot',async()=>{
  const state=current(),sent=[];
  let responseIndex=0;
  const controller=new VisualBotController({
    getCurrent:()=>state,
    sendIntent:async(kind)=>{
      sent.push(kind);
      responseIndex+=1;
      if(responseIndex===1)return {kind:'reject',code:'ILLEGAL_MOVE'};
      if(responseIndex===2){state.rev+=1;state.stateHash='hash-4';return {kind:'snapshot',reason:'STALE_REV'};}
      state.state.status='finished';return {kind:'ack'};
    }
  });
  controller.wait=async()=>{};
  await controller.start();
  assert.deepEqual(sent,['foundationMove','draw','foundationMove']);
});
