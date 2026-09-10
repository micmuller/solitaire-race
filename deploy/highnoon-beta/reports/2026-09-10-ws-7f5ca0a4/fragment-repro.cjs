'use strict';
// Run only in highnoon-ws-fix-test against the scratch origin, never the beta.
const {WebSocket,WebSocketServer}=require('/app/node_modules/ws');
(async()=>{
 const base='http://candidate-origin:8080';
 const r=await fetch(base+'/vnext/matches',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({seed:'BOUNDED-ERROR-EVENT-REPRO',mode:'split'})});if(!r.ok)throw Error('create failed');const m=await r.json();
 const maxFragments=new WebSocketServer({noServer:true}).options.maxFragments;
 if(!(maxFragments>0 && maxFragments<=16384))throw Error('Unexpected fragment budget');
 const ws=new WebSocket('ws://candidate-origin:8080/vnext?matchId='+m.matchId+'&clientId=p1');ws.on('error',()=>{});
 const closed=new Promise((resolve,reject)=>{const t=setTimeout(()=>{ws.terminate();reject(Error('timeout'))},5000);ws.once('close',code=>{clearTimeout(t);resolve(code)})});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
 for(let i=0;i<=maxFragments;i++)ws.send('',{fin:false});
 const closeCode=await closed;await new Promise(r=>setTimeout(r,300));
 let healthStatus;try{healthStatus=(await fetch(base+'/health',{signal:AbortSignal.timeout(3000)})).status}catch{healthStatus='unreachable'}
 console.log(JSON.stringify({maxFragments,sentEmptyFrames:maxFragments+1,closeCode,healthStatus,expectedHealthStatus:200,status:healthStatus===200?'PASS':'FAIL'}));process.exitCode=healthStatus===200?0:1;
})().catch(e=>{console.error(e.message);process.exitCode=1});
