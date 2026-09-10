'use strict';
const assert=require('node:assert/strict');
const {WebSocket,WebSocketServer}=require('/app/node_modules/ws');
const {PROTOCOL_VERSION}=require('/app/vnext/core');
const base='http://candidate-origin:8080';
function event(s,name,p=()=>true){return new Promise((r,j)=>{const t=setTimeout(()=>{s.off(name,l);j(Error('timeout '+name))},5000);function l(...a){if(p(...a)){clearTimeout(t);s.off(name,l);r(a)}}s.on(name,l)})}
(async()=>{
 const results=[];
 for(const failure of ['fragments','invalid-utf8','transport-close']){
  const sockets=[];
  async function match(){const r=await fetch(base+'/vnext/matches',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({seed:'IMAGE-LIFECYCLE',mode:'split'})});assert.equal(r.status,201);return (await r.json()).matchId}
  async function connect(id,seat,reconnect=false){const s=new WebSocket(base.replace('http:','ws:')+'/vnext?matchId='+id+'&clientId='+seat+(reconnect?'&reconnect=1':''));sockets.push(s);s.on('error',()=>{});const [b]=await event(s,'message');assert.equal(JSON.parse(b).kind,'snapshot');return s}
  async function draw(s,id,seat,seq,rev){const ack=event(s,'message',b=>JSON.parse(b).kind==='ack');s.send(JSON.stringify({protocolVersion:PROTOCOL_VERSION,matchId:id,clientId:seat,seq,baseRev:rev,kind:'draw',payload:{source:{zone:'stock',owner:seat},target:{zone:'waste',owner:seat}}}));const [b]=await ack;assert.equal(JSON.parse(b).rev,rev+1)}
  try{
   const attacked=await match(),other=await match();const bad=await connect(attacked,'p1'),same=await connect(attacked,'p2'),unrelated=await connect(other,'p1');const closed=event(bad,'close');
   if(failure==='fragments'){const max=new WebSocketServer({noServer:true}).options.maxFragments;assert.equal(max,16384);for(let i=0;i<=max;i++)bad.send('',{fin:false})}
   else if(failure==='invalid-utf8')bad.send(Buffer.from([255]),{binary:false});else bad.terminate();
   const [code]=await closed;if(failure!=='transport-close')assert.equal(code,failure==='fragments'?1008:1007);
   assert.equal((await fetch(base+'/health')).status,200);
   await draw(unrelated,other,'p1',0,0);await draw(same,attacked,'p2',0,0);
   const fresh=await connect(attacked,'p1');await draw(fresh,attacked,'p1',0,1);
   const oldClosed=event(fresh,'close');const replacement=await connect(attacked,'p1',true);await oldClosed;await draw(replacement,attacked,'p1',1,2);
   assert.equal((await fetch(base+'/health')).status,200);
   results.push({failure,closeCode:code,health:200,unrelatedAck:true,sameMatchAck:true,newConnectionAck:true,replacementReconnectAck:true,status:'PASS'});
  }finally{for(const s of sockets)s.terminate()}
 }
 console.log(JSON.stringify({status:'PASS',results}));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
