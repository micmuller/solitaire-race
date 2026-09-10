'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {ProtocolClient,createMatch}=require('/app/vnext/client/protocolClient');
const {WebSocket,WebSocketServer}=require('/app/node_modules/ws');
const base='http://candidate-origin:8080'; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const api=await import('/app/vnext/web/protocol-client.mjs');
 const a=await api.createLobbySession(base,{nickname:'WS-Fix-Host'}),b=await api.createLobbySession(base,{nickname:'WS-Fix-Guest'});
 const lobby=await api.createLobbyGame(base,{sessionToken:a.sessionToken,name:'WS Fix regression',seed:'WS-FIX-7f5ca0a4',mode:'split'});
 await api.joinLobbyGame(base,lobby.game.gameId,{sessionToken:b.sessionToken});
 const id=lobby.game.matchId;
 const p1=new ProtocolClient({baseUrl:base,matchId:id,clientId:'p1'}),p2=new ProtocolClient({baseUrl:base,matchId:id,clientId:'p2'});
 await Promise.all([p1.connect(),p2.connect()]);
 for(const c of [p1,p2])assert.equal((await c.sendIntent('draw',{source:{zone:'stock',owner:c.clientId},target:{zone:'waste',owner:c.clientId}})).kind,'ack');
 const disconnected=new Promise(resolve=>p2.socket.once('close',resolve));p2.close();await disconnected;
 const resumed=p2;const snapshot=await resumed.connect({reconnect:true});
 await sleep(50);assert.equal(resumed.current.rev,2);assert.equal(resumed.current.stateHash,p1.current.stateHash);
 assert.equal((await resumed.sendIntent('resign',{})).kind,'ack');await sleep(150);
 const history=[];for(const player of [a,b]){const h=await api.listProfileMatches(base,{sessionToken:player.sessionToken});assert.equal(h.matches.length,1);history.push({nickname:player.nickname,seat:h.matches[0].seat,won:h.matches[0].won,matchId:h.matches[0].matchId});}
 assert.equal(history[0].won,true);assert.equal(history[1].won,false);
 const bot=await createMatch(base,{seed:'WS-FIX-BOT',mode:'split'});const observer=new WebSocket(base.replace('http:','ws:')+'/vnext?matchId='+bot.matchId+'&clientId=observer');let botAcks=0;observer.on('message',d=>{if(JSON.parse(d).kind==='ack')botAcks++;});await new Promise((r,j)=>{observer.once('open',r);observer.once('error',j)});
 const r=await fetch(base+'/vnext/matches/'+bot.matchId+'/bot',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({clientId:'p2',speed:'fast',maxActions:20})});assert(r.ok);
 const backup=JSON.parse(cp.execFileSync('node',['deploy/highnoon-beta/backup.cjs'],{encoding:'utf8',env:{...process.env,RELEASE_REVISION:'7f5ca0a4d483a4a7a461ecec4894585027d9fc80'}}));
 const db=fs.readdirSync(backup.backupDirectory).find(x=>x.endsWith('.sqlite'));
 const verification=JSON.parse(cp.execFileSync('node',['vnext/server/adminCli.js','verify','--from',backup.backupDirectory+'/'+db,'--backup-directory','/backups/verify'],{encoding:'utf8'}));assert.equal(verification.sha256,backup.sha256);
 for(let i=0;i<30 && botAcks===0;i++)await sleep(100);assert(botAcks>0);
 const normal={status:'PASS',scope:'normal gameplay through candidate origin; fragment probe excluded',wsVersion:require('/app/node_modules/ws/package.json').version,twoPlayerDraws:2,reconnectRevision:2,history,botAcksObserved:botAcks,onlineBackup:backup,backupIntegrity:verification.integrity};
 fs.writeFileSync('/evidence/normal-regression.json',JSON.stringify(normal,null,2));
 if(process.env.SKIP_FRAGMENT==='1'){for(const c of [p1,p2,resumed])c.close();observer.close();console.log(JSON.stringify(normal));return;}
 const fragment=await createMatch(base,{seed:'FRAGMENT-BOUNDED',mode:'split'});const ws=new WebSocket(base.replace('http:','ws:')+'/vnext?matchId='+fragment.matchId+'&clientId=p1');
 const budget=new WebSocketServer({noServer:true}).options.maxFragments;
 const closed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.terminate();reject(Error('fragment rejection timeout'))},5000);ws.on('error',()=>{});ws.once('close',code=>{clearTimeout(timer);resolve(code)});});
 await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});for(let i=0;i<=budget;i++)ws.send('',{fin:false});const code=await closed;assert.equal(code,1008);
 for(const c of [p1,p2,resumed])c.close();observer.close();
 const health=await fetch(base+'/health');assert(health.ok);
 const out={status:'PASS',wsVersion:require('/app/node_modules/ws/package.json').version,twoPlayerDraws:2,reconnectRevision:2,history,botAcksObserved:botAcks,onlineBackup:backup,backupIntegrity:verification.integrity,fragmentBudget:budget,excessFragmentsCloseCode:code,scope:'isolated candidate through actual candidate nginx; synthetic protocol clients, not browser UAT'};
 fs.writeFileSync('/evidence/regression.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));
})().catch(e=>{console.error(e.stack);process.exit(1)});
