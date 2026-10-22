// Real pointer handlers: touching, dragging, cancelling or double tapping a tile
// must never execute a discard; only the separate confirmation button may do it.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const registry=new Map();
function el(){return {innerHTML:'',textContent:'',hidden:true,style:{},dataset:{},events:{},disabled:false,classList:{add(){},remove(){},toggle(){},contains(){return false;}},addEventListener(t,fn){this.events[t]=fn;},querySelector(){return el();},closest(){return null;},setPointerCapture(){},click(){this.onclick?.();}};}
const doc=el();doc.querySelector=s=>{if(!registry.has(s))registry.set(s,el());return registry.get(s);};doc.querySelectorAll=()=>[];doc.body={appendChild(){}};
doc.getElementById=id=>doc.querySelector('#'+id);
const ctx={document:doc,location:{search:'?mode=8'},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},URLSearchParams,console,localStorage:{getItem(){return null;},setItem(){}},URL};ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(['engine.js','ui.js','app.js','experience.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n;\n'),ctx);
const run=s=>vm.runInContext(s,ctx);
function reset(){run("G={mode:'p8',hand:0,scores:[0,0,0,0],specials:[0,0,0,0],h:{wall:makeDeck(),wealth:'白',ind:'发',turn:0,over:false,turnActionTaken:false,kongDraw:false,discards:[[],[],[],[]],P:[0,1,2,3].map(()=>({hand:[],melds:[],flowers:[],piao:0}))}};G.h.P[0].hand=['1万','2万','3万','4万','5万','6万','7万','8万','9万','1条','2条','3条','东','南'];selectedHandIndex=-1;handSignature='';handPointer.id=null;handPointer.suppressClick=false;renderHand();");}
const hand=registry.get('#hand'),button=registry.get('#discardBtn');
const tile=el();tile.dataset.i='0';tile.closest=()=>tile;
const pointer=(extra={})=>({target:tile,pointerId:1,clientX:100,clientY:100,isPrimary:true,button:0,preventDefault(){},...extra});
reset();hand.events.pointerdown(pointer());hand.events.pointerup(pointer());assert.equal(run('selectedHandIndex'),0);assert.equal(run('G.h.P[0].hand.length'),14);assert.equal(run('G.h.discards[0].length'),0);
hand.events.click(pointer());hand.events.click(pointer());assert.equal(run('G.h.P[0].hand.length'),14,'double tap selects only');
button.onclick();assert.equal(run('G.h.P[0].hand.length'),13);assert.equal(run('G.h.discards[0].length'),1);button.onclick();assert.equal(run('G.h.discards[0].length'),1,'repeat confirm locked');
reset();hand.events.pointerdown(pointer());hand.events.pointermove(pointer({clientX:130}));hand.events.pointerup(pointer({clientX:130}));hand.events.click(pointer());assert.equal(run('selectedHandIndex'),-1,'drag cancels selection');
reset();hand.events.pointerdown(pointer());hand.events.pointercancel(pointer());hand.events.click(pointer());assert.equal(run('selectedHandIndex'),-1,'cancel cannot synthesize a selection');
reset();hand.events.pointerdown(pointer());hand.events.pointerdown(pointer({pointerId:2,isPrimary:false}));assert.equal(run('handPointer.id'),1,'second finger cannot steal pointer');hand.events.pointerup(pointer());assert.equal(run('G.h.discards[0].length'),0);
reset();run('G.h.turn=1');hand.events.pointerdown(pointer());hand.events.pointerup(pointer());button.onclick();assert.equal(run('G.h.discards[0].length'),0,'wrong turn cannot discard');
reset();run('selectHandTile(0)');doc.events.keydown({key:'Enter',target:{closest(){return null;}},preventDefault(){}});assert.equal(run('G.h.discards[0].length'),0,'global Enter never discards');
reset();ctx.Net={active:true,canAct:()=>false};button.onclick();hand.events.pointerdown(pointer());hand.events.pointerup(pointer());assert.equal(run('G.h.discards[0].length'),0,'disconnected seat cannot act');
console.log('INPUT_OK: tap, double tap, drag, cancel, second finger, repeated confirmation, wrong turn, Enter and disconnected seat');
// Both solo and network renderers hide concealed kongs; public melds retain an
// explicit action label so they cannot be mistaken for an opponent's hand.
assert.equal((run("meldFace({type:'gang',tiles:['3万','3万','3万','3万']})").match(/暗杠牌背/g)||[]).length,4);
assert(!run("meldFace({type:'gang',tiles:['3万','3万','3万','3万']})").includes('3万'),'solo view also conceals opponent kong identity');
assert.equal((run("meldFace({type:'gang',tiles:['3万','3万','3万','3万']},true)").match(/暗杠牌背/g)||[]).length,2);
assert(run("meldFace({type:'peng',tiles:['3万','3万','3万'],from:1})").includes('meld-label\">碰'),'public meld is labelled');
// A heartbeat must preserve the identity of a selected tile, even when server
// insertion order differs from the sorted hand shown on screen.
ctx.location.search='';ctx.addEventListener=()=>{};ctx.crypto=require('node:crypto').webcrypto;
vm.runInContext(fs.readFileSync('net.js','utf8'),ctx);ctx.Net.active=false;reset();
run("var rawState=JSON.parse(JSON.stringify(G));rawState.phase={kind:'turn',id:'stable-decision',actor:0};rawState.options=[];rawState.h.P[0].hand.reverse();Net.active=true;Net.ready=true;Net.pid=0;Net.ws={readyState:1,send(){}};var envelope={protocol:2,epoch:'test',seq:1,names:['a','b','c','d'],online:[0,1],mode:'p8',G:rawState};Net.applyState(envelope);selectHandTile(0);");
assert.equal(button.textContent,'打出 1万');run('Net.applyState(envelope)');assert.equal(button.textContent,'打出 1万','heartbeat cannot change the selected tile');button.onclick();assert.equal(ctx.Net.pending.message.action.tile,'1万','confirmed tile matches what the player saw');
console.log('SELECTION_SYNC_OK: unchanged heartbeat preserves selected tile identity and submitted tile');
