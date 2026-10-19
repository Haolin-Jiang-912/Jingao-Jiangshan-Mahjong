import assert from 'node:assert/strict';
import {createGame,applyAction,aiAction,tickGame,seatState,assertGame} from './game-core.mjs';
let seed=1;const original=Math.random;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
let turns=0,claims=0,hands=0;
for(let trial=0;trial<12;trial++){
  seed=trial+1;const g=createGame(trial%2?'ju':'p8',[0,1,2,3]);assert(g.h.dice?.pairs,'the server records every seat’s dice');let now=Date.now();
  for(let guard=0;guard<12000;guard++){
    assertGame(g);if(g.phase.kind==='matchEnd')break;
    const ph=g.phase;
    if(ph.kind==='turn'){applyAction(g,ph.actor,aiAction(g,ph.actor),++now);turns++;}
    else if(ph.kind==='claim'||ph.kind==='rob'){
      const p=Object.keys(ph.offers).find(p=>!Object.hasOwn(ph.replies,p));
      applyAction(g,+p,{act:'claim',choice:Math.random()<.55?ph.offers[p][0]:null},++now);claims++;
    }else if(ph.kind==='handEnd'){
      const old=g.hand;for(const p of [0,1,2,3])applyAction(g,p,{act:'ready'},++now);
      tickGame(g,[0,1,2,3],++now);hands++;if(g.mode==='ju'&&g.hand>60)break;
      assert(g.hand>old||g.phase.kind==='matchEnd');
    }
    const view=seatState(g,2);assert.equal(view.h.wall.length,g.h.wall.length);
    for(const p of [0,1,3])assert(view.h.P[p].hand.every(t=>t==='白'));
    assert.deepEqual(view.h.P[2].hand,g.h.P[2].hand);
    if(guard===11999)throw new Error('game stalled seed '+trial);
  }
}
Math.random=original;
// Reconstruct a game after JSON persistence, mid-claim and mid-kong.
const g=createGame('p8',[0,1]);const snapshot=JSON.parse(JSON.stringify(g));
assert.deepEqual(seatState(g,0),seatState(snapshot,0));
const before=JSON.stringify(g);assert.throws(()=>applyAction(g,(g.phase.actor+1)%4,{act:'discard',tile:'东'}));assert.equal(JSON.stringify(g),before);
console.log('ROOM_ENGINE_OK '+JSON.stringify({hands,turns,claims,checks:'144 tiles, score conservation, hidden hands, complete matches, persistence, wrong-seat rejection'}));
// Explicit action fixtures cover uncommon branches without waiting for chance.
{
  const R=globalThis.MahjongRules;
  function fixture(hands,melds={}){
    const g=createGame('p8',[0,1,2,3]);g.h.wall=R.makeDeck();g.h.discards=[[],[],[],[]];
    g.h.P=[0,1,2,3].map(p=>({hand:hands[p]||[],melds:melds[p]||[],flowers:[],piao:0,hasDisc:false,draws:0}));
    for(const P of g.h.P)for(const t of [...P.hand,...P.melds.flatMap(m=>m.tiles)]){const i=g.h.wall.indexOf(t);assert(i>=0,'fixture uses physical deck');g.h.wall.splice(i,1);}
    g.h.wealth='白';g.h.turn=0;g.h.drawn=null;g.phase={kind:'turn',actor:0,id:'fixture',since:Date.now()};return g;
  }
  function discardClaim(kind,hand1,opt){
    const g=fixture({0:['3万'],1:hand1});applyAction(g,0,{act:'discard',tile:'3万'});
    assert.equal(g.phase.kind,'claim');applyAction(g,1,{act:'claim',choice:{act:kind,...(opt?{opt}:{})}});assertGame(g);return g;
  }
  let q=discardClaim('吃',['1万','2万'],['1万','2万']);assert.equal(q.h.P[1].melds[0].type,'chi');assert.equal(q.phase.actor,1);
  q=discardClaim('碰',['3万','3万']);assert.equal(q.h.P[1].melds[0].type,'peng');
  q=discardClaim('杠',['3万','3万','3万']);assert.equal(q.h.P[1].melds[0].tiles.length,4);assert.equal(q.h.kongDraw,true);
  q=fixture({0:['3万','3万','3万','3万']});applyAction(q,0,{act:'angang',t:'3万'});assertGame(q);assert.equal(q.h.P[0].melds[0].tiles.length,4);
  q=fixture({0:['3万']},{0:[{type:'peng',tiles:['3万','3万','3万'],from:2}]});applyAction(q,0,{act:'jiagang',t:'3万',mi:0});assertGame(q);assert.equal(q.h.P[0].melds[0].tiles.length,4);
  q=fixture({0:['东'],1:['1万','2万','3万','4万','5万','6万','1条','2条','3条','7筒','8筒','9筒','白']},{0:[{type:'peng',tiles:['东','东','东'],from:2}]});
  applyAction(q,0,{act:'jiagang',t:'东',mi:0});assert.equal(q.phase.kind,'rob');const persisted=JSON.parse(JSON.stringify(q));
  applyAction(persisted,1,{act:'claim',choice:{act:'qiang'}});assertGame(persisted);assert.equal(persisted.result.winner,1);assert.equal(persisted.result.robbed,0);
  q=fixture({0:['3万'],1:['1万','2万']});applyAction(q,0,{act:'discard',tile:'3万'});
  const deadline=q.phase.deadline;assert(tickGame(q,[0,1,2,3],deadline+1));assert.equal(q.phase.kind,'turn');assert.equal(q.phase.actor,1);assertGame(q);
  console.log('ACTION_FIXTURES_OK: chi, peng, exposed/concealed/added kong, persisted rob-kong and claim timeout');
}
{
 const R=globalThis.MahjongRules,g=createGame('p8',[0,1,2,3]),p=g.phase.actor,now=g.phase.since+60000;
 assert.equal(tickGame(g,[0,1,2,3].filter(q=>q!==p),now,{[p]:now}),false,'refresh gets a fresh grace period');
 assert.equal(tickGame(g,[0,1,2,3].filter(q=>q!==p),now+5001,{[p]:now}),true,'AI takes over only after disconnect grace');assertGame(g);
 console.log('RECONNECT_GRACE_OK: long human turn does not cause immediate AI discard on page refresh');
}
