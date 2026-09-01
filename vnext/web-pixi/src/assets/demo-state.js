const suits = ['C','D','H','S'];
const make = (copy, suit, rank, faceDown = false) => ({ cardId:`demo:${copy}:${suit}:${rank}`, suit, rank, faceDown });
const pile = (copy, index, count, down = 2) => Array.from({length:count},(_,i)=>make(`${copy}:t${index}`,suits[(index+i)%4],((13-i+index)%13)+1,i<down));
const player = (copy, long = false) => ({
  stock: [make(copy,'S',13,true)], waste: [make(copy,'C',12,false)], score: long ? 186 : 144,
  tableau: Array.from({length:7},(_,index)=>pile(copy,index,long ? 8+index : 5+index,Math.min(index,3)))
});

export const DEMO_CURRENT = {
  rev: 42, stateHash: '4b2dcinematicpremiumdemohash', state: {
    schemaVersion:'1.3.0', rulesVersion:'1.0.0', seed:'MOCKUP-4-2', mode:'split', status:'active', winner:null, endedReason:null, endedBy:null,
    players:{ p1:player('p1',true), p2:player('p2',false) },
    foundations: ['C','C','D','D','H','H','S','S'].map((suit,index)=>({suit,cards:index%2?[make(`f${index}`,suit,index+1,false)]:[]}))
  }
};
