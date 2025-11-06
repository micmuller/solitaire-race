// game.js – main script for Solitaire HighNoon
// Set VERSION here so scaling.js and UI can pick it up
window.VERSION = window.VERSION || '2.9.3'; // <- hier anpassen
const VERSION = window.VERSION;

/* ============================================================
   Solitaire HighNoon — v2.7.8-stable (Basis), externalisiert für v2.9.x
   - Stable Baseline (keine visuellen Mirror-Effekte, keine Transform/Flex-Änderungen)
   - Standard: mirror-Param wird auf 1 gesetzt (kann via ?mirror=0 deaktiviert werden)
   - Overlay zeigt Mirror-Status (mirror:on/off)
   - Kompatibel mit responsive Scaling (scaling.js)
   - Auto-Höhe für Tableau-Piles, damit Foundations in der Mitte nie überdeckt werden
   - v2.9.3: Recycle-Fixes (robustere Trigger) + Hotkey-Foundation-Bugfix
   ============================================================ */
(function(){

  // ---------- URL / Mirror-Flag (nur Status/Default, keine Logikänderung) ----------
  const url = new URL(location.href);
  if(!url.searchParams.has('mirror')) { url.searchParams.set('mirror','1'); history.replaceState({},'',url); }
  const MIRROR_PARAM = url.searchParams.get('mirror');
  const MIRROR_ON = MIRROR_PARAM === '1';

  // ---------- Layout-Konstanten (müssen zu CSS-Variablen passen) ----------
  const CARD_H = 120;     // entspricht --card-h
  const STACK_YD = 24;    // entspricht --stack-yd

  // ---------- Helpers ----------
  function showToast(msg){ const t=document.getElementById('toast'); if(!t) return; t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1800); }
  const el=s=>document.querySelector(s);
  const mk=(t,c)=>{const e=document.createElement(t);if(c)e.className=c;return e;};

  function canRecycle(side){
    return state[side].stock.length===0 && state[side].waste.length>0;
  }

  // RNG
  function rng(seedStr){
    function xmur3(str){for(var i=0,h=1779033703^str.length;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353);h=h<<13|h>>>19;}return function(){h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return (h^h>>>16)>>>0;};}
    function mulberry32(a){return function(){var t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
    const seed=xmur3(seedStr||'')(); return { random:mulberry32(seed) };
  }

  // Cards
  const SUITS=["♠","♥","♦","♣"];
  const RANKS=["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  function newDoubleDeck(tag){ const deck=[]; for(let d=0;d<2;d++){ for(const s of SUITS){ for(let r=0;r<RANKS.length;r++){ deck.push({suit:s,rank:r,up:false,id:`${tag}-${d}-${s}-${r}`}); } } } return deck; }
  function shuffle(a,r){const arr=a.slice();for(let i=arr.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
  function isRed(s){return s==="♥"||s==="♦";}
  function cardLabel(c){return `${RANKS[c.rank]}${c.suit}`;}

  // ---------- State ----------
  const state={
    seed:url.searchParams.get('seed')||'',
    room:url.searchParams.get('room')||'',
    you:{stock:[],waste:[],tableau:[[],[],[],[],[],[],[]]},
    opp:{stock:[],waste:[],tableau:[[],[],[],[],[],[],[]]},
    foundations:Array.from({length:8},(_,i)=>({suit:SUITS[i%4],cards:[]})),
    moves:0,over:false
  };

  // ---------- Owner ----------
  let localOwner='Y';
  let hasSetPerspective=false;
  function ownerToSide(owner){return owner===localOwner?'you':'opp';}
  const PILES=7;

  // ---------- Deal ----------
  function deal(seedStr){
    const r=rng(seedStr||'');
    const base=shuffle(newDoubleDeck('B'),r.random);
    const deckYou=[],deckOpp=[];
    for(let i=0;i<base.length;i++){
      const c={...base[i]};
      if(i%2===0){c.id=`Y-${i}-${c.suit}-${c.rank}`;deckYou.push(c);} else {c.id=`O-${i}-${c.suit}-${c.rank}`;deckOpp.push(c);}
    }
    let i=0;
    for(let p=0;p<7;p++){for(let k=0;k<=p;k++){const c=deckYou[i++];c.up=(k===p);state.you.tableau[p].push(c);}}
    state.you.stock=deckYou.slice(i);
    i=0;
    for(let p=0;p<7;p++){for(let k=0;k<=p;k++){const c=deckOpp[i++];c.up=(k===p);state.opp.tableau[p].push(c);}}
    state.opp.stock=deckOpp.slice(i);
  }

  // ---------- DOM / Render ----------
  function renderAll(){
    const mv=document.getElementById('moves'); if(mv) mv.textContent=String(state.moves);

    // clear
    ['you','opp'].forEach(side=>{
      el(`#${side}-tableau`)?.replaceChildren();
      el(`#${side}-stock`)?.replaceChildren();
      el(`#${side}-waste`)?.replaceChildren();
    });
    el('#foundations')?.replaceChildren();

    // foundations (8)
    state.foundations.forEach((f,i)=>{
      const slot=mk('div','foundation'); slot.dataset.f=i; el('#foundations')?.appendChild(slot);
      f.cards.forEach((c,idx)=>{const card=renderCard(c);card.style.top=`${idx*2}px`;slot.appendChild(card);});
    });

    // stacks
    renderStack('you'); renderStack('opp');

    // tableaux 0..6
    ['you','opp'].forEach(side=>{
      const cont=el(`#${side}-tableau`); if(!cont) return;
      for(let p=0;p<PILES;p++){
        const pileEl=mk('div','pile');
        pileEl.dataset.zone=`${side}-pile-${p}`;
        cont.appendChild(pileEl);
        const pile=state[side].tableau[p];
        pile.forEach((c,idx)=>{const card=renderCard(c);card.style.top=`${idx*STACK_YD}px`;pileEl.appendChild(card);});
      }
    });

    // Auto-Höhe pro Pile an Kartenanzahl anpassen
    resizeTableauHeights();

    setupDrops();
    updateOverlay();
  }

  function resizeTableauHeights(){
    ['you','opp'].forEach(side=>{
      const cont=document.querySelector(`#${side}-tableau`);
      if(!cont) return;
      cont.querySelectorAll('.pile').forEach((pileEl, uiIdx)=>{
        const pile = state[side].tableau[uiIdx] || [];
        const needed = Math.max(CARD_H, CARD_H + Math.max(0, pile.length - 1) * STACK_YD);
        pileEl.style.height = needed + 'px';
      });
    });
  }

  function renderStack(side){
    const stockEl=el(`#${side}-stock`); const wasteEl=el(`#${side}-waste`);
    const s=state[side].stock;
    if(stockEl){
      if(s.length){ const top=s[s.length-1]; const back=renderCard({...top,up:false}); stockEl.appendChild(back); }
      // Auch wenn leer: Platzhalter bleibt für Klicks/DBL-Klicks erhalten (Handler sitzen auf Container)
    }
    if(wasteEl){ state[side].waste.slice(-3).forEach((c,i)=>{const card=renderCard(c);card.style.left=`${i*16}px`;wasteEl.appendChild(card);}); }
  }

  function renderCard(c){
    const e=mk('div','card');
    if(!c.up) e.classList.add('faceDown');
    else { e.classList.add(isRed(c.suit)?'red':'black'); e.textContent=cardLabel(c); }
    e.draggable=!!c.up; e.dataset.cardId=c.id;
    e.addEventListener('dragstart',onDragStart);
    e.addEventListener('dragend',onDragEnd);
    e.addEventListener('dblclick',onDoubleClickAutoMove);
    return e;
  }

  // ---------- Rules ----------
  function canPlaceOnTableau(under,card){ if(!under) return card.rank===12; const alt=isRed(under.suit)!==isRed(card.suit); return under.rank===card.rank+1&&alt; }
  function canPlaceOnFoundation(f,card){ if(f.cards.length===0) return card.rank===0; const top=f.cards[f.cards.length-1]; return top && top.suit===card.suit && card.rank===top.rank+1; }
  function locOfCard(id){
    for(const side of ['you','opp']){
      const w=state[side].waste.findIndex(c=>c.id===id); if(w>-1) return {type:'waste',side,idx:w};
      for(let p=0;p<7;p++){const idx=state[side].tableau[p].findIndex(c=>c.id===id); if(idx>-1) return {type:'pile',side,pile:p,idx};}
    }
    for(let f=0;f<state.foundations.length;f++){const idx=state.foundations[f].cards.findIndex(c=>c.id===id); if(idx>-1) return {type:'found',f,idx};}
    return null;
  }
  function isFaceUpSequence(side,pileIndex,startIdx){
    const pile=state[side].tableau[pileIndex];
    for(let i=startIdx;i<pile.length-1;i++){
      const a=pile[i],b=pile[i+1];
      if(!a.up||!b.up) return false;
      if(isRed(a.suit)===isRed(b.suit)) return false;
      if(a.rank!==b.rank+1) return false;
    }
    return pile[startIdx]?.up===true;
  }

  // ---------- Drag & Drop ----------
  let drag={origin:null,count:1};
  function isMine(loc){ return loc && loc.side === ownerToSide(localOwner); }

  function onDragStart(e){
    const id=e.target.dataset.cardId; const loc=locOfCard(id);
    drag.origin=null; drag.count=1;
    if(!isMine(loc)){ e.preventDefault(); return; }
    drag.origin=loc;
    e.dataTransfer.setData('text/plain',id);
    e.target.classList.add('dragging');
    if(loc?.type==='pile'){
      const pile=state[loc.side].tableau[loc.pile];
      if(isFaceUpSequence(loc.side,loc.pile,loc.idx)) drag.count=pile.length-loc.idx;
    }
  }
  function onDragEnd(e){ e.target.classList.remove('dragging'); }

  function onDoubleClickAutoMove(e){
    const id=e.currentTarget.dataset.cardId; const loc=locOfCard(id); if(!loc) return;
    if(!isMine(loc)) return;
    let card;
    if(loc.type==='pile'){
      const pile=state[loc.side].tableau[loc.pile]; if(loc.idx!==pile.length-1) return; card=pile[loc.idx];
    } else if(loc.type==='waste'){
      if(loc.idx!==state[loc.side].waste.length-1) return; card=state[loc.side].waste[loc.idx];
    } else return;
    const t=state.foundations.findIndex(f=>canPlaceOnFoundation(f,card)); // BUGFIX: nicht state[side].foundations
    if(t>-1) applyMove({owner:localOwner,kind:'toFound',cardId:id,count:1,to:{kind:'found',f:t}},true);
  }

  function setupDrops(){
    // Foundations
    document.querySelectorAll('.foundation').forEach(slot=>{
      slot.addEventListener('dragover',ev=>ev.preventDefault());
      slot.addEventListener('drop',ev=>{
        ev.preventDefault();
        const id=ev.dataTransfer.getData('text/plain'); const loc=locOfCard(id); if(!loc||!isMine(loc)) return;
        const fIdx=Number(slot.dataset.f); const f=state.foundations[fIdx];
        const card=(loc.type==='waste')?state[loc.side].waste[loc.idx]
                  :(loc.type==='pile'?state[loc.side].tableau[loc.pile][loc.idx]
                                      :state.foundations[loc.f].cards[loc.idx]);
        if(card&&canPlaceOnFoundation(f,card)){
          applyMove({owner:localOwner,kind:'toFound',cardId:id,count:1,to:{kind:'found',f:fIdx}},true);
        }
      });
    });

    // Nur eigene Piles droppbar
    const mySide = ownerToSide(localOwner);
    const myStock = el(`#${mySide}-stock`);
    const myWaste = el(`#${mySide}-waste`);

    for(let ui=0; ui<7; ui++){
      const pileEl=document.querySelector(`[data-zone="${mySide}-pile-${ui}"]`);
      if(!pileEl) continue;
      pileEl.addEventListener('dragover',ev=>ev.preventDefault());
      pileEl.addEventListener('drop',ev=>{
        ev.preventDefault();
        const id=ev.dataTransfer.getData('text/plain'); const loc=locOfCard(id); if(!loc||!isMine(loc)) return;
        const destPile=state[mySide].tableau[ui];
        const under=destPile[destPile.length-1];
        const srcTop=(loc.type==='waste')?state[loc.side].waste[loc.idx]:state[loc.side].tableau[loc.pile][loc.idx];
        if(!srcTop?.up) return;
        if(canPlaceOnTableau(under,srcTop)){
          const count=(loc.type==='pile'&&isFaceUpSequence(loc.side,loc.pile,loc.idx))?state[loc.side].tableau[loc.pile].length-loc.idx:1;
          applyMove({ owner: localOwner, kind:'toPile', cardId:id, count,
            from:{kind:'pile', sideOwner: localOwner, uiIndex:(loc.type==='pile'?loc.pile:-1)},
            to:{kind:'pile', sideOwner: localOwner, uiIndex: ui } }, true);
        }
      });
    }

    // Klick/Shortcuts
    if(myStock) {
      // Klick auf Stock: Flip; Doppelklick auf leeren Stock: Recycle
      myStock.onclick = ()=>{
        const side=ownerToSide(localOwner);
        const s=state[side].stock; if(s.length) { applyMove({owner:localOwner,kind:'flip'},true); }
      };
      myStock.ondblclick = ()=>{
        const side=ownerToSide(localOwner);
        if(canRecycle(side)) applyMove({owner:localOwner,kind:'recycle'},true);
      };
    }
    if(myWaste){
      // Doppelklick auf Waste: Recycle (falls Stock leer)
      myWaste.ondblclick = ()=>{
        const side=ownerToSide(localOwner);
        if(canRecycle(side)) applyMove({owner:localOwner,kind:'recycle'},true);
      };
    }

    document.onkeydown=(ev)=>{
      if(state.over) return;
      const side=ownerToSide(localOwner);
      if(ev.key===' '){ ev.preventDefault(); const s=state[side].stock; if(s.length) applyMove({owner:localOwner,kind:'flip'},true); }
      else if(ev.key==='r' || ev.key==='R'){ if(canRecycle(side)) applyMove({owner:localOwner,kind:'recycle'},true); }
      else if(ev.key==='f' || ev.key==='F'){
        const w=state[side].waste; if(!w.length) return;
        const card=w[w.length-1];
        const t=state.foundations.findIndex(f=>canPlaceOnFoundation(f,card)); // BUGFIX: nicht state[side].foundations
        if(t>-1) applyMove({owner:localOwner,kind:'toFound',cardId:card.id,count:1,to:{kind:'found',f:t}},true);
      }
    };
  }

  // ---------- Moves ----------
  function applyMove(move,announce=true){
    try{
      const side=ownerToSide(move.owner);
      if(move.kind==='flip'){
        const s=state[side].stock;
        if(s.length){ const c=s.pop(); c.up=true; state[side].waste.push(c); }
        if(announce) state.moves++;
        renderAll(); if(announce) send(move); return;
      }
      if(move.kind==='recycle'){
        if(state[side].stock.length===0 && state[side].waste.length>0){
          const rev=[...state[side].waste].reverse(); rev.forEach(c=>c.up=false);
          state[side].stock = rev; state[side].waste = [];
        } else {
          showToast('Nichts zu recyceln');
        }
        if(announce) state.moves++;
        renderAll(); if(announce) send(move); return;
      }

      const loc=move.cardId?locOfCard(move.cardId):null; if(!loc) return;
      if(announce && loc.side !== ownerToSide(move.owner)) return;

      if(!announce) console.debug('[NET] move', move);

      let cards=[];
      if(loc.type==='waste'){
        if(loc.idx!==state[loc.side].waste.length-1) return;
        cards.push(state[loc.side].waste.pop());
      } else if(loc.type==='pile'){
        const pile=state[loc.side].tableau[loc.pile];
        const count=move.count||1; cards=pile.splice(loc.idx,count);
        if(pile.length>0) pile[pile.length-1].up=true;
      } else if(loc.type==='found'){
        if(loc.idx!==state.foundations[loc.f].cards.length-1) return;
        cards.push(state.foundations[loc.f].cards.pop());
      }
      if(cards.length===0) return;

      if(move.to && move.to.kind==='found'){
        state.foundations[move.to.f].cards.push(cards[0]);
      } else if(move.to && move.to.kind==='pile'){
        const ownerRef = move.to.sideOwner || move.owner; // 'Y'|'O'
        const targetSide = ownerToSide(ownerRef);          // 'you'|'opp'
        const uiIndex = (move.to.uiIndex!=null) ? move.to.uiIndex : (move.to.pile!=null ? move.to.pile : 0);
        state[targetSide].tableau[uiIndex].push(...cards);
      }
      if(announce) state.moves++;
      renderAll(); if(announce) send(move);
      checkWin();
    }catch(err){ console.error('applyMove error',err); showToast('Move-Fehler: '+(err?.message||String(err))); }
  }

  function checkWin(){ const total=state.foundations.reduce((a,f)=>a+f.cards.length,0); if(total===208){ state.over=true; showToast('Alle Karten abgetragen!'); } }

  // ---------- WS ----------
  const peers=new Map();
  let clientId=Math.random().toString(36).slice(2);
  let ws=null, pingTimer=null, lastMsgAt=0, latencyMs=null;

  function setText(id,txt){ const n=document.getElementById(id); if(n) n.textContent=txt; }
  function updateOverlay(){
    const online = ws && ws.readyState===1;
    const dot=document.getElementById('dot');
    const ovSync=document.getElementById('ov-sync');
    if(dot) dot.classList.toggle('ok', !!online);
    if(ovSync) ovSync.textContent = online ? 'online' : 'offline';
    setText('ov-room', state.room||'—');
    setText('ov-seed', state.seed||'—');
    setText('ov-peers', String(peers.size));
    setText('ov-latency', latencyMs!=null ? `${Math.max(0,Math.round(latencyMs))} ms` : '—');
    setText('ov-last', lastMsgAt>0 ? (Math.floor((Date.now()-lastMsgAt)/1000)||0)+'s ago' : '—');
    setText('ov-version', VERSION + (MIRROR_ON ? ' · mirror:on' : ' · mirror:off'));
  }

  setInterval(()=>{ const now=Date.now(); for(const [id,ts] of peers){ if(now-ts>15000) peers.delete(id); } updateOverlay(); }, 1000);
  function sendSys(o){ if(ws&&ws.readyState===1) ws.send(JSON.stringify({sys:o,from:clientId})); }
  function send(m){ if(ws&&ws.readyState===1) ws.send(JSON.stringify({move:m,from:clientId})); }
  function buildWsUrl(){ const override=url.searchParams.get('ws'); if(override) return override; const isHttps=location.protocol==='https:'; const proto=isHttps?'wss:':'ws:'; const host=location.hostname||'127.0.0.1'; const currentPort=(location.port?parseInt(location.port,10):(isHttps?443:80)); const wsPort=url.searchParams.get('ws_port') || (currentPort===3001?3001:(isHttps?443:3001)); return `${proto}//${host}:${wsPort}/ws?room=${encodeURIComponent(state.room.trim())}`; }
  function connectWS(){ const room=state.room.trim(); if(!room){ showToast('Room-ID fehlt'); return; } const wsUrl=buildWsUrl(); ws=new WebSocket(wsUrl); ws.onopen=()=>{ showToast('Verbunden'); sendSys({type:'hello'}); updateOverlay(); pingTimer=setInterval(()=>{ if(ws && ws.readyState===1){ const ts=Date.now(); sendSys({type:'ping', ts}); } }, 5000); }; ws.onclose=()=>{ showToast('Getrennt'); clearInterval(pingTimer); updateOverlay(); }; ws.onerror=(err)=>{ console.error('WS error',err); }; ws.onmessage=(ev)=>{ lastMsgAt=Date.now(); try{ const msg=JSON.parse(ev.data); if(msg.from) peers.set(msg.from, Date.now()); if(msg.sys){ if(msg.sys.type==='hello' && msg.from){ if(!hasSetPerspective){ const iAmY = clientId.localeCompare(msg.from) < 0; const desired = iAmY ? 'Y' : 'O'; if(localOwner!==desired){ localOwner=desired; [state.you, state.opp] = [state.opp, state.you]; renderAll(); showToast('Perspektive: '+localOwner); } else { localOwner=desired; } hasSetPerspective=true; } sendSys({type:'hello-ack', from: clientId}); } else if(msg.sys.type==='ping' && typeof msg.sys.ts==='number'){ sendSys({type:'pong', ts: msg.sys.ts}); } else if(msg.sys.type==='pong' && typeof msg.sys.ts==='number'){ latencyMs = Date.now() - msg.sys.ts; } updateOverlay(); return; } if(msg.move) applyMove(msg.move, false); updateOverlay(); }catch(e){ console.error('WS-Error', e); } }; }

  // ---------- Boot ----------
  function newGame(){ state.you={stock:[],waste:[],tableau:[[],[],[],[],[],[],[]]}; state.opp={stock:[],waste:[],tableau:[[],[],[],[],[],[],[]]}; state.foundations=Array.from({length:8},(_,i)=>({suit:SUITS[i%4],cards:[]})); state.moves=0; state.over=false; deal(state.seed||''); renderAll(); }

  window.addEventListener('DOMContentLoaded',()=>{
    const seedIn=el('#seed'), roomIn=el('#room');
    if(seedIn) seedIn.value=state.seed; if(roomIn) roomIn.value=state.room;
    el('#newGame')?.addEventListener('click',()=>{ state.seed=(seedIn?.value||'').trim(); url.searchParams.set('seed',state.seed); history.replaceState({},'',url); newGame(); });
    el('#connect')?.addEventListener('click',()=>{ state.room=(roomIn?.value||'').trim(); url.searchParams.set('room',state.room); history.replaceState({},'',url); connectWS(); });

    // Version / Overlay initial
    const setText=(id,txt)=>{ const n=document.getElementById(id); if(n) n.textContent=txt; };
    setText('ov-version', VERSION + (MIRROR_ON ? ' · mirror:on' : ' · mirror:off'));
    setText('ver', (VERSION.startsWith('v')?'':'v') + VERSION);
    document.title = `Solitaire HighNoon — v${VERSION}`;

    newGame();
  });
})();