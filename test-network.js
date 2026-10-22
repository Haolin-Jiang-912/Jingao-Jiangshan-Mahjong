// Four real production net.js clients in separate JS realms over real sockets.
// No browser or simulated game authority: every transition comes from the server.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),WebSocket=require('ws'),{webcrypto}=require('node:crypto');
const base=process.env.TEST_WS_URL||'ws://127.0.0.1:3001';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,ms=Number(process.env.TEST_WAIT_MS)||12000){const start=Date.now();while(Date.now()-start<ms){if(fn())return;await sleep(30);}throw new Error('timeout: '+label+' '+JSON.stringify(peers.map(c=>({pid:c.Net.pid,ready:c.Net.ready,online:c.Net.online,status:c.noteText,phase:c.G?.phase?.kind}))));}
const peers=[];const room='Q'+Math.random().toString(36).slice(2,7).toUpperCase();
function client(role,name,token){
  const nodes=new Map(),storage=new Map(token?[['jw-v2-token-'+room+'-'+role,token]]:[]);
  const $=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',textContent:'',hidden:true,disabled:false,style:{},classList:{add(){},remove(){},contains(){return false;}},select(){}});return nodes.get(s);};
  const c={URL,URLSearchParams,WebSocket,crypto:webcrypto,setTimeout,clearTimeout,setInterval,clearInterval,console,G:null,NAMES:['a','b','c','d'],
    location:{search:'?'+new URLSearchParams({role,name,room,mode:'ju',ws:base}),protocol:'http:',host:'127.0.0.1:3003',href:'http://127.0.0.1:3003/game.html'},
    sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},navigator:{clipboard:{writeText:async()=>{}}},document:{hidden:false,addEventListener(){}},addEventListener(){},$,escapeHTML:s=>String(s),face:t=>t,
    renderAll(){c.renders=(c.renders||0)+1;},renderHandControls(){},note(s){c.noteText=s;},setActions(a){c.actions=a;},clearActions(){c.actions=[];},showModal(html,buttons){c.modal={html,buttons};}};
  c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('engine.js','utf8'),c);vm.runInContext(fs.readFileSync('net.js','utf8'),c);
  c.acks=new Map();const dispatch=c.Net.dispatch;c.Net.dispatch=function(m){if(m.type==='ack')c.acks.set(m.id,m);return dispatch.call(this,m);};
  peers.push(c);return c;
}
function normalized(c){
  const g=c.G,p=c.Net.pid;if(!g)return null;const idx=i=>(i-p+4)%4;
  return JSON.stringify({id:g.id,revision:g.revision,phase:g.phase.id,kind:g.phase.kind,actor:g.phase.actor,wall:g.h.wall.length,wealth:g.h.wealth,
    dealer:(g.h.dealer+p)%4,dice:g.h.dice?[0,1,2,3].map(i=>g.h.dice.pairs[idx(i)]):null,scores:[0,1,2,3].map(i=>g.scores[idx(i)]),discards:[0,1,2,3].map(i=>g.h.discards[idx(i)]),melds:[0,1,2,3].map(i=>g.h.P[idx(i)].melds.map(m=>m.type==='gang'&&!Number.isInteger(m.from)?{...m,tiles:m.tiles.map(()=>null)}:m)),counts:[0,1,2,3].map(i=>g.h.P[idx(i)].hand.length)});
}
async function consistent(active){
  await until(()=>active.every(c=>c.G)&&new Set(active.map(normalized)).size===1,'all views agree');
  for(const c of active)for(const q of [1,2,3]){
    assert(c.G.h.P[q].hand.every(t=>t==='白'),'hidden opponent cards');
    for(const m of c.G.h.P[q].melds)if(m.type==='gang'&&!Number.isInteger(m.from))assert(m.tiles.every(t=>t===null),'concealed kong identity never reaches another client');
  }
}
function choose(c){
  const g=c.G,ph=g.phase;
  if(ph.kind==='turn'&&ph.actor===c.Net.pid){
    if(g.options.length)return g.options[0];
    const hand=g.h.P[0].hand;return {act:'discard',tile:hand.find(t=>t!==g.h.wealth)||hand[0],confirmWealth:true};
  }
  if((ph.kind==='claim'||ph.kind==='rob')&&ph.offers.length&&!ph.responded)return {act:'claim',choice:ph.offers[0]};
  if((ph.kind==='handEnd'||ph.kind==='matchEnd')&&!ph.ready.includes(c.Net.pid))return {act:'ready'};
}
(async()=>{
  const origin=base.replace(/^ws/,'http');for(const route of ['/','/game.html','/style.css','/health'])assert.equal((await fetch(origin+route,{method:'HEAD',signal:AbortSignal.timeout(15000)})).status,200);
  const a=client('host','房主');await until(()=>a.Net.ready,'host ready');
  const b=client('client','同学乙'),c=client('client','同学丙'),d=client('client','同学丁');const active=[a,b,c,d];
  await until(()=>active.every(c=>c.Net.ready)&&a.Net.online.length===4,'four seats');
  a.Net.command({act:'start'});await consistent(active);assert(active.every(c=>c.G.mode==='ju'));
  // Drop an ACK after the server has applied the action. Production retry must
  // reuse its ID and must not remove a second tile.
  let actor=active.find(c=>c.Net.pid===a.G.phase.actor),dropped=false;
  const dispatch=actor.Net.dispatch;actor.Net.dispatch=function(m){if(m.type==='ack'&&!dropped){dropped=true;return;}return dispatch.call(this,m);};
  const first=choose(actor);const actionId=(actor.Net.command(first),actor.Net.pending.message.id);
  assert.equal(actor.Net.command(first),false,'second click cannot submit again while pending');
  await until(()=>dropped&&!actor.Net.pending,'lost ACK recovery',10000);assert(dropped);await consistent(active);
  const seq=actor.Net.seq;actor.Net.raw({type:'command',protocol:2,id:actionId,epoch:actor.Net.epoch,decision:'old',action:first});await sleep(180);
  assert.equal(actor.Net.seq,seq,'duplicate command causes no second state change');
  // A command from a previous decision is rejected and followed by full sync.
  const before=normalized(actor);actor.Net.raw({type:'command',protocol:2,id:webcrypto.randomUUID(),epoch:actor.Net.epoch,decision:'expired-phase',action:first});await sleep(180);assert.equal(normalized(actor),before);
  // Actual net.js reconnection and a new JS realm (full page refresh) use tokens.
  const old=b.Net.ws;b.Net.connect();await until(()=>b.Net.ready&&b.Net.ws!==old,'client reconnect');await consistent(active);
  const hostToken=a.Net.token;a.Net._fatal=true;clearInterval(a.Net._timer);a.Net.ws.close();
  const restored=client('host','房主刷新',hostToken);active[0]=restored;
  await until(()=>restored.Net.ready&&restored.G,'host page refresh restores game');await consistent(active);
  // Persisted phase, private hand and revision must be the same after refresh.
  let commands=0,settlements=0;const settledHands=new Set();
  while(commands<240&&settlements<2){
    await consistent(active);let acted=false,submitted=null;
    if(active[0].G.phase.kind==='handEnd')settledHands.add(active[0].G.phase.id);
    for(const player of active){const action=choose(player);if(action&&!player.Net.pending){player.Net.command(action);submitted={player,id:player.Net.pending.message.id};commands++;acted=true;break;}}
    if(!acted)throw new Error('no player can act in '+active[0].G.phase.kind);
    await until(()=>active.every(c=>!c.Net.pending),'command acknowledgement');
    assert.equal(submitted.player.acks.get(submitted.id)?.ok,true,'a gameplay command must actually be accepted: '+submitted.player.acks.get(submitted.id)?.error);
    await consistent(active);
    if(active[0].G.phase.kind==='handEnd')settledHands.add(active[0].G.phase.id);
    settlements=settledHands.size;
  }
  assert(commands>40,'sustained gameplay');
  assert(settlements>=2,'two real hand settlements, including matches ending on hand zero');
  // Disconnect the current actor: cloud AI must move, without any host browser.
  await consistent(active);const current=active.find(c=>c.Net.pid===active[0].G.phase.actor);
  if(current&&active[0].G.phase.kind==='turn'){
    const decision=current.G.phase.id;current.Net._fatal=true;clearInterval(current.Net._timer);current.Net.ws.close();
    const remaining=active.filter(c=>c!==current);await until(()=>remaining.every(c=>c.G.phase.id!==decision),'server AI replaces offline actor',12000);await consistent(remaining);
  }
  console.log('MULTIPLAYER_OK '+JSON.stringify({clients:4,commands,settlements,checks:'production net.js; identical wall, discards, melds, turns, scores; private hands; dropped ACK retry; duplicate/stale rejection; reconnect; host refresh; cloud AI'}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>{for(const c of peers){c.Net._fatal=true;clearInterval(c.Net._timer);clearTimeout(c.Net._retry);try{c.Net.ws?.close();}catch{}}setTimeout(()=>process.exit(process.exitCode||0),100);});
