import { Application } from 'pixi.js';
import './styles.css';
import { BoardScene } from './render/board-scene.js';
import { InputLock } from './input/input-lock.js';
import { resolveQuality } from './theme/tokens.js';
import { DEMO_CURRENT } from './assets/demo-state.js';
import { ProtocolClient, createLobbyGame, createLobbySession, createMatch, deleteLobbyGame, endLobbyMatch, joinLobbyGame, leaveLobbyGame, listLobbyGames, restartMatch, startBot, stopBots } from '../../web/protocol-client.mjs';
import { autoFoundationIntent, dropIntent, tableauSelection, wasteSelection } from '../../web/intent-mapping.mjs';
import { cueForIntentResult } from '../../web/effects.mjs';
import { generateRandomSeed } from '../../web/seed.mjs';
import { inviteUrl, readLaunchParams } from '../../web/lobby.mjs';
import { gameForMatch, interactionAllowed, waitingMatchMessage } from './bridge/match-context.js';

export const WEB_PIXI_CLIENT_VERSION = '0.1.1';
const $ = (selector) => document.querySelector(selector);
const all = (selector) => [...document.querySelectorAll(selector)];
const STORAGE = { nickname:'solitaire-vnext:nickname', session:'solitaire-vnext:lobbySessionId', server:'solitaire-vnext:serverBaseUrl', quality:'solitaire-pixi:quality', mute:'solitaire-pixi:mute' };
let mode = 'split', baseUrl = storageGet(STORAGE.server) || window.location.origin, client = null, lobbyPlayer = null, activeGame = null, activeKind = 'human', selection = null, audioContext = null, celebrated = null;
const inputLock = new InputLock();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let quality = resolveQuality(localStorage.getItem(STORAGE.quality) || 'balanced', reducedMotion);

const pixi = new Application();
await pixi.init({ resizeTo: $('#board-shell'), background: '#082a20', antialias: true, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, quality.resolutionCap), preference: 'webgl' });
$('#pixi-stage').appendChild(pixi.canvas); $('#loading').hidden = true;

const board = new BoardScene(pixi, {
  quality,
  canInteract: () => canSendActions(),
  onSource: (meta) => handleSource(meta), onStock: () => handleStock(), onTarget: (target) => handleTarget(target), onAutoFoundation: (meta, card) => handleAutoFoundation(meta, card)
});
board.resize($('#board-shell').clientWidth, $('#board-shell').clientHeight);

function showToast(text, type = '') { const toast=$('#toast'); toast.textContent=text; toast.className=`toast ${type}`; toast.hidden=false; clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>toast.hidden=true,2600); status(text); }
function status(text, title = 'Status') { $('#status-title').textContent=title; $('#status-detail').textContent=text; $('#accessible-state').textContent=text; }
function debug(text) { if (!$('#debug-toggle').checked) return; const hud=$('#debug-hud'); hud.hidden=false; hud.textContent=`${new Date().toLocaleTimeString()} ${text}\n${hud.textContent}`.slice(0,4000); }
function storageGet(key) { try { return localStorage.getItem(key)||''; } catch { return ''; } }
function overlayOpen(element, value) { element.hidden=!value; const reason=`overlay:${element.id}`; if(value) inputLock.lock(reason); else inputLock.unlock(reason); $('#board-lock').hidden=!inputLock.locked; $('#menu-open').setAttribute('aria-expanded',String(value&&element.id==='menu-overlay')); }
function setMode(next) { mode=next==='shared'?'shared':'split'; all('[data-mode]').forEach((button)=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode))); $('#mode-label').textContent=mode.toUpperCase(); }
function setRoute(matchId, role) { const url=new URL(location.href); url.search=''; url.searchParams.set('matchId',matchId); url.searchParams.set('role',role); history.replaceState({},'',url); }
function updateMeta() { const current=client?.current; $('#revision').textContent=current?`rev ${current.rev}`:'rev –'; $('#hash').textContent=current?`hash ${current.stateHash.slice(0,12)}`:'hash –'; $('#profile-role').textContent=client?.clientId||'–'; $('#profile-match').textContent=client?.matchId||'–'; const displayId=client?.clientId==='p2'?'p2':'p1'; $('#score-label').textContent=String(current?.state.players?.[displayId]?.score??0); $('#player-label').textContent=lobbyPlayer?.nickname||client?.clientId?.toUpperCase()||'Gast'; $('#mode-label').textContent=(current?.state.mode||mode).toUpperCase(); }
function canSendActions() { return interactionAllowed({ locked:inputLock.locked, current:client?.current, role:client?.clientId, lobbyStatus:activeGame?.status }); }

async function prepareMatchContext(matchId, role) {
  const games=(await listLobbyGames(baseUrl)).games||[];
  const game=gameForMatch(games,matchId);
  if(!game){activeGame=null;return;}
  activeGame=game;
  if(role!=='p2'||game.status!=='waiting')return;
  await ensurePlayer();
  const joined=await joinLobbyGame(baseUrl,game.gameId,{sessionId:lobbyPlayer.sessionId});
  if(joined.role!=='p2')throw new Error('P2 benötigt ein zweites Gerät oder ein getrenntes Browserprofil mit eigener Lobby-Identität.');
  activeGame=joined.game;
}

function renderCurrent(current, source='snapshot') { board.applyState(current,{source}); updateMeta(); if(source==='ack'){const score=$('#score-label');score.classList.remove('pulse');requestAnimationFrame(()=>score.classList.add('pulse'));} const local=client?.clientId==='p2'?'p2':'p1', opponent=local==='p1'?'p2':'p1'; const state=current.state; $('#accessible-state').textContent=`Revision ${current.rev}. ${local.toUpperCase()} hat ${state.players[local].stock.length} Karten im Stock, ${state.players[local].waste.length} im Waste und ${state.players[local].score} Punkte. Gegner ${state.players[opponent].score} Punkte.`; if(state.status==='finished') { const key=`${client?.matchId}:${current.stateHash}`; if(celebrated!==key){celebrated=key;board.celebrate();} $('#game-over-title').textContent=`${state.winner?.toUpperCase()||'Match'} gewinnt`; $('#game-over-text').textContent=`P1 ${state.players.p1.score} · P2 ${state.players.p2.score} · ${state.endedReason}`; if(!$('#game-over').open)setTimeout(()=>{if(!$('#game-over').open)$('#game-over').showModal();},state.endedReason==='completed'?1200:0); } }

async function connect(matchId, role, { route=true }={}) {
  client?.close(); selection=null; board.clearTransient();
  if(!activeGame||activeGame.matchId!==matchId)await prepareMatchContext(matchId,role);
  client=new ProtocolClient({baseUrl,matchId,clientId:role}); board.setLocalId(role);
  client.subscribe((event)=>{
    if(event.type==='state') renderCurrent(event.current,event.source);
    if(event.type==='response'&&event.response.kind==='snapshot'&&event.response.reason!=='INITIAL_CONNECT'){ selection=null; board.clearTransient(); showToast(`Synchronisiert: ${event.response.reason}`); }
    if(event.type==='lobbyStart'){ if(activeGame) activeGame.status='active'; showToast('P2 ist beigetreten – Spiel aktiv'); }
    if(event.type==='lobbyWaiting'){ if(activeGame) activeGame.status='waiting'; showToast('Warte auf P2'); }
    if(event.type==='lobbyEnd'||event.type==='lobbyDelete') returnToLobby();
    if(event.type==='response'&&event.response.code==='MATCH_NOT_ACTIVE'){activeGame={...(activeGame||{}),matchId,status:'waiting'};status(waitingMatchMessage(role),'Lobby wartet');}
    if(event.type==='disconnected'){ $('#connection-dot').classList.remove('online'); status('Verbindung getrennt','Offline'); }
  });
  status('Verbindung wird aufgebaut …'); await client.connect(); $('#connection-dot').classList.add('online'); overlayOpen($('#start-overlay'),false); if(route)setRoute(matchId,role); updateMeta();
  if(activeGame?.status==='waiting')status(waitingMatchMessage(role),'Lobby wartet');else status(role==='observer'?'Beobachtermodus':'Dein Tisch ist bereit','Verbunden');
}

function selectionForMeta(meta) { if(meta.zone==='waste') return wasteSelection(client.clientId,meta.pileCards); if(meta.zone==='tableau') return tableauSelection(client.clientId,meta.pileIndex,meta.cardIndex,meta.pileCards); return null; }
function handleSource(meta) {
  if(meta.zone==='stock') return handleStock();
  if(selection&&meta.zone==='tableau') return handleTarget({zone:'tableau',index:meta.pileIndex});
  if(meta.zone==='tableau'&&meta.card.faceDown&&meta.cardIndex===meta.pileCards.length-1) return sendIntent('flip',{source:{zone:'tableau',owner:client.clientId,index:meta.pileIndex}});
  selection=selectionForMeta(meta); board.setSelection(selection); if(selection) status(`${selection.count} Karte${selection.count===1?'':'n'} ausgewählt`,'Auswahl');
}
function handleStock() { const local=client?.current?.state.players?.[client.clientId]; if(!local)return; const kind=local.stock.length?'draw':'recycle'; const payload=kind==='draw'?{source:{zone:'stock',owner:client.clientId},target:{zone:'waste',owner:client.clientId}}:{source:{zone:'waste',owner:client.clientId},target:{zone:'stock',owner:client.clientId}}; sendIntent(kind,payload); }
function handleTarget(target) { if(target.zone==='stock')return handleStock(); const intent=dropIntent(selection,client?.clientId,target); if(intent)sendIntent(intent.kind,intent.payload); }
function handleAutoFoundation(meta,card) { const next=selectionForMeta(meta), intent=autoFoundationIntent(next,client.current.state.foundations,card); if(intent)sendIntent(intent.kind,intent.payload); else showToast('Keine passende Foundation','error'); }

async function sendIntent(kind,payload) {
  if(!client)return;
  if(!canSendActions()){if(activeGame?.status==='waiting')showToast(waitingMatchMessage(client.clientId),'error');return;}
  inputLock.lock('pending'); $('#board-lock').hidden=false; board.setPending(true); debug(`intent ${kind} seq=${client.nextSeq}`);
  try { const response=await client.sendIntent(kind,payload); debug(`${response.kind} ${response.code||''} rev=${response.rev}`); playCue(cueForIntentResult(kind,response)); if(response.kind==='reject'){ board.rejectToAuthority(); showToast(`Abgelehnt: ${response.code}`,'error'); } else if(response.kind==='ack') showToast(`${kind} bestätigt`); selection=null; board.setSelection(null); }
  catch(error){ board.rejectToAuthority(); showToast(error.message,'error'); }
  finally { board.setPending(false); inputLock.unlock('pending'); $('#board-lock').hidden=!inputLock.locked; }
}

async function ensurePlayer(){ const nickname=$('#nickname').value.trim()||'HighNoon'; const result=await createLobbySession(baseUrl,{sessionId:storageGet(STORAGE.session),nickname}); lobbyPlayer=result.player; localStorage.setItem(STORAGE.session,lobbyPlayer.sessionId); localStorage.setItem(STORAGE.nickname,lobbyPlayer.nickname); return lobbyPlayer; }
async function refreshLobby(){ const result=await listLobbyGames(baseUrl), list=$('#lobby-games'), sessionId=lobbyPlayer?.sessionId||storageGet(STORAGE.session); list.replaceChildren(); for(const game of result.games||[]){ const ownHost=game.players.p1?.sessionId===sessionId,ownGuest=game.players.p2?.sessionId===sessionId; const row=document.createElement('div'); row.className='lobby-game'; const label=document.createElement('span'); label.textContent=`${game.name} · ${game.players.p1?.nickname||'P1'} vs ${game.players.p2?.nickname||'offen'} · ${game.mode}`; const button=document.createElement('button'); button.textContent=ownHost?'Als P1 öffnen':ownGuest?'Als P2 öffnen':'Als P2 beitreten'; button.disabled=game.status==='finished'||Boolean(game.players.p2&&!ownGuest&&!ownHost); button.onclick=async()=>{try{await ensurePlayer(); if(ownHost||ownGuest){activeGame=game;await connect(game.matchId,ownHost?'p1':'p2');return;} const joined=await joinLobbyGame(baseUrl,game.gameId,{sessionId:lobbyPlayer.sessionId}); activeGame=joined.game; await connect(joined.matchId,joined.role);}catch(e){showToast(e.message,'error')}}; row.append(label,button); list.append(row); } if(!list.children.length)list.textContent='Keine offenen Spiele.'; }
async function hostLobby(){ try{await ensurePlayer(); const created=await createLobbyGame(baseUrl,{sessionId:lobbyPlayer.sessionId,name:$('#game-name').value.trim()||'HighNoon',seed:generateRandomSeed(),mode}); activeGame=created.game; await connect(created.matchId,'p1'); status('Warte auf P2','Lobby');}catch(e){showToast(e.message,'error')} }
async function hostBot(versus=false){ try{activeGame=null; const match=await createMatch(baseUrl,generateRandomSeed(),mode); activeKind=versus?'bot-versus':'bot'; if(versus){await startBot(baseUrl,match.matchId,{clientId:'p1',speed:'medium'});await startBot(baseUrl,match.matchId,{clientId:'p2',speed:'medium'});await connect(match.matchId,'observer');}else{await connect(match.matchId,'p1');await startBot(baseUrl,match.matchId,{clientId:'p2',speed:'medium'});}}catch(e){showToast(e.message,'error')} }
function startDemo(){ client={clientId:'p1',matchId:'demo-4-2',current:structuredClone(DEMO_CURRENT)}; board.setLocalId('p1'); renderCurrent(client.current,'snapshot'); overlayOpen($('#start-overlay'),false); $('#connection-dot').classList.add('online'); status('Repräsentativer autoritativer Snapshot-Fixture','Demo'); }
async function doRestart(newSeed){ if(!client||client.matchId.startsWith('demo'))return startDemo(); if(!lobbyPlayer){showToast('Restart benötigt ein gehostetes Lobby-Spiel','error');return;} try{await restartMatch(baseUrl,client.matchId,newSeed?generateRandomSeed():client.current.state.seed,client.current.state.mode,{sessionId:lobbyPlayer.sessionId});overlayOpen($('#menu-overlay'),false);}catch(e){showToast(e.message,'error')} }
function returnToLobby(){ if(client&&!client.matchId.startsWith('demo'))stopBots(baseUrl,client.matchId).catch(()=>{});client?.close?.();client=null;activeGame=null;activeKind='human';selection=null;board.clearTransient();overlayOpen($('#menu-overlay'),false);overlayOpen($('#start-overlay'),true);$('#connection-dot').classList.remove('online');refreshLobby().catch(()=>{}); }
async function leaveOrDelete(){if(!activeGame||!lobbyPlayer)return showToast('Kein Lobby-Sitz aktiv','error');try{if(client?.clientId==='p1'&&activeGame.status==='waiting')await deleteLobbyGame(baseUrl,activeGame.gameId,{sessionId:lobbyPlayer.sessionId});else if(client?.clientId==='p2')await leaveLobbyGame(baseUrl,activeGame.gameId,{sessionId:lobbyPlayer.sessionId});else return showToast('Nur wartender Host oder P2 kann den Sitz freigeben','error');returnToLobby();}catch(e){showToast(e.message,'error')}}
async function endGame(){if(!client||!lobbyPlayer)return showToast('Nur der Lobby-Host kann beenden','error');try{await endLobbyMatch(baseUrl,client.matchId,{sessionId:lobbyPlayer.sessionId});returnToLobby();}catch(e){showToast(e.message,'error')}}
async function reconnect(){ if(!client||client.matchId.startsWith('demo'))return; const id=client.matchId,role=client.clientId;client.close();await new Promise(r=>setTimeout(r,100));await connect(id,role,{route:false});overlayOpen($('#menu-overlay'),false); }

function playCue(cue){ if(!cue||$('#mute').checked)return; audioContext??=new AudioContext(); const now=audioContext.currentTime,osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type=cue==='invalid'?'sawtooth':'triangle';osc.frequency.value={draw:330,move:392,foundation:659,invalid:150,sync:240}[cue]||300;gain.gain.setValueAtTime(.035,now);gain.gain.exponentialRampToValueAtTime(.0001,now+.15);osc.connect(gain).connect(audioContext.destination);osc.start(now);osc.stop(now+.16);}

$('#nickname').value=storageGet(STORAGE.nickname)||'HighNoon'; $('#quality').value=quality.name; $('#mute').checked=storageGet(STORAGE.mute)==='1'; $('#server-url').value=baseUrl;
all('[data-mode]').forEach((button)=>button.onclick=()=>setMode(button.dataset.mode)); $('#refresh-games').onclick=()=>refreshLobby().catch(e=>showToast(e.message,'error')); $('#host-game').onclick=hostLobby; $('#host-bot').onclick=()=>hostBot(false); $('#bot-versus').onclick=()=>hostBot(true); $('#demo-game').onclick=startDemo;
$('#connect-match').onclick=()=>connect($('#match-id').value.trim(),$('#role').value).catch(e=>showToast(e.message,'error'));
$('#menu-open').onclick=()=>overlayOpen($('#menu-overlay'),true); $('#profile-open').onclick=()=>overlayOpen($('#profile-overlay'),true); all('[data-close]').forEach((button)=>button.onclick=()=>overlayOpen(button.closest('.overlay'),false));
$('#return-lobby').onclick=returnToLobby; $('#restart-same').onclick=()=>doRestart(false); $('#restart-new').onclick=()=>doRestart(true); $('#resign').onclick=()=>sendIntent('resign',{}); $('#reconnect').onclick=()=>reconnect().catch(e=>showToast(e.message,'error'));
$('#leave-game').onclick=leaveOrDelete; $('#end-game').onclick=endGame; $('#stop-bots').onclick=()=>client&&stopBots(baseUrl,client.matchId).then(()=>showToast('Bots gestoppt')).catch(e=>showToast(e.message,'error'));
$('#save-server-url').onclick=()=>{try{const url=new URL($('#server-url').value.trim());if(!['http:','https:'].includes(url.protocol))throw new Error();baseUrl=url.toString().replace(/\/$/,'');localStorage.setItem(STORAGE.server,baseUrl);showToast('Server gespeichert');}catch{showToast('Ungültige Server-URL','error')}};
$('#copy-invite').onclick=async()=>{if(!client)return;await navigator.clipboard.writeText(inviteUrl({origin:location.origin,pathname:'/vnext/pixi/',matchId:client.matchId}));showToast('Einladungslink kopiert');};
$('#quality').onchange=()=>{localStorage.setItem(STORAGE.quality,$('#quality').value);showToast('Qualität wird beim Neuladen aktiviert');}; $('#mute').onchange=()=>localStorage.setItem(STORAGE.mute,$('#mute').checked?'1':'0'); $('#debug-toggle').onchange=()=>$('#debug-hud').hidden=!$('#debug-toggle').checked;
window.addEventListener('keydown',(event)=>{if(event.key==='Escape'){selection=null;board.setSelection(null);all('.overlay:not([hidden])').filter(x=>x.id!=='start-overlay').forEach(x=>overlayOpen(x,false));}});
window.addEventListener('resize',()=>board.resize($('#board-shell').clientWidth,$('#board-shell').clientHeight));

const launch=readLaunchParams(location.search); if(new URLSearchParams(location.search).get('demo')==='1')startDemo(); else if(launch)connect(launch.matchId,launch.role).catch(e=>showToast(e.message,'error')); else ensurePlayer().then(()=>refreshLobby()).catch(()=>refreshLobby().catch(()=>{}));
