'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { ProtocolClient, createMatch } = require('/app/vnext/client/protocolClient');
const base = 'http://highnoon-beta-origin:8080';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const report={start:new Date().toISOString(),durationSeconds:1800,rounds:0,playerAcks:0,botObservedAcks:0,errors:[]};
async function post(path, body){const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});assert(r.ok,`${path} ${r.status}`);return r.json();}
(async()=>{
 const deadline=Date.now()+1800000;
 while(Date.now()<deadline){
  const match=await createMatch(base,{seed:'BOB-LOAD-'+report.rounds,mode:'split'});
  const bot=await createMatch(base,{seed:'BOB-BOT-'+report.rounds,mode:'split'});
  const clients=['p1','p2'].map(clientId=>new ProtocolClient({baseUrl:base,matchId:match.matchId,clientId}));
  const {WebSocket}=require('/app/node_modules/ws');
  let ws;
  const observer={connect:()=>new Promise((resolve,reject)=>{ws=new WebSocket(base.replace('http:','ws:')+'/vnext?matchId='+bot.matchId+'&clientId=observer');ws.once('open',resolve);ws.once('error',reject);ws.on('message',d=>{if(JSON.parse(d).kind==='ack')report.botObservedAcks++;});}),close:()=>ws?.close()};
  try{
   await Promise.all([...clients,observer].map(c=>c.connect()));
   await post(`/vnext/matches/${bot.matchId}/bot`,{clientId:'p2',speed:'fast',maxActions:60});
   for(let i=0;i<20 && Date.now()<deadline;i++){
    for(const c of clients){const a=await c.sendIntent('draw',{source:{zone:'stock',owner:c.clientId},target:{zone:'waste',owner:c.clientId}});assert.equal(a.kind,'ack');report.playerAcks++;}
    await sleep(1500);
   }
   const end=await clients[0].sendIntent('resign',{});assert.equal(end.kind,'ack');
  } finally {for(const c of [...clients,observer])c.close();}
  report.rounds++;
  fs.writeFileSync('/evidence/load-progress.json',JSON.stringify({...report,observed:new Date().toISOString()},null,2));
 }
 report.end=new Date().toISOString();report.status='PASS';
 fs.writeFileSync('/evidence/load-result.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
})().catch(e=>{report.status='FAIL';report.end=new Date().toISOString();report.errors.push(e.message);fs.writeFileSync('/evidence/load-result.json',JSON.stringify(report,null,2));console.error(e.message);process.exit(1);});
