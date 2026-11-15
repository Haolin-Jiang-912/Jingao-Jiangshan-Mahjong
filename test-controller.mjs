import assert from 'node:assert/strict';
import {RoomController} from './room-controller.mjs';
import {aiAction} from './game-core.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
let stored,alarm,failNextSave=false;const sockets=[];
const io={sockets:()=>sockets,save:async value=>{if(failNextSave){failNextSave=false;throw new Error('temporary storage failure');}stored=clone(value);},schedule:async value=>{alarm=value;},clear:async()=>{stored=null;}};
function socket(){let meta=null;const ws={readyState:1,messages:[],send(s){this.messages.push(JSON.parse(s));},close(){this.readyState=3;},serializeAttachment(m){meta=m;},deserializeAttachment(){return meta;}};sockets.push(ws);return ws;}
let room=new RoomController(io);const players=[];
for(let p=0;p<4;p++){const ws=socket();players.push(ws);await room.join(ws,new URLSearchParams({room:'UNIT88',role:p?'client':'host',name:'p'+p,protocol:2}));}
let n=0;const command=(ws,action,extra={})=>({type:'command',protocol:2,id:'command-'+(++n),epoch:room.data.epoch,decision:room.data.game?.phase.id,action,...extra});
await room.receive(players[0],JSON.stringify(command(players[0],{act:'start'})));
const g=room.data.game,p=g.phase.actor,actor=players[p],action=aiAction(g,p),msg=command(actor,action);
await Promise.all([room.receive(actor,JSON.stringify(msg)),room.receive(actor,JSON.stringify(msg))]);
assert.equal(room.data.game.revision,2,'concurrent duplicate executes once');
const expected=clone(room.data.game),savedReceipt=clone(room.data.receipts);
// Simulate DO eviction/reconstruction from durable storage, keeping sockets.
room=new RoomController(io,stored);assert.deepEqual(room.data.game,expected);assert.deepEqual(room.data.receipts,savedReceipt);
await room.receive(actor,JSON.stringify(msg));assert.deepEqual(room.data.game,expected,'retry after eviction is idempotent');
const old=players[0],token=old.deserializeAttachment().token;old.readyState=2;
const resumed=socket();await room.join(resumed,new URLSearchParams({room:'UNIT88',role:'host',protocol:2,token}));
await room.disconnected(old);assert.equal(room.data.seats[token].expires,null,'late old close does not expire new connection');
const currentActor=p===0?resumed:actor;
const stale=command(currentActor,action,{decision:'expired'});await room.receive(currentActor,JSON.stringify(stale));assert.deepEqual(room.data.game,expected,'stale action cannot change game');
const ack=currentActor.messages.at(-1);assert.equal(ack.type,'ack');assert.equal(ack.ok,false);assert(ack.snapshot.G,'rejection supplies complete state');
const spoof=JSON.stringify({type:'state',G:{scores:[10000,0,0,0]}});await room.receive(currentActor,spoof);assert.deepEqual(room.data.game,expected);
const ph=room.data.game.phase,fp=ph.kind==='turn'?ph.actor:+Object.keys(ph.offers).find(pid=>!Object.hasOwn(ph.replies,pid));
const fws=fp===0?resumed:players[fp],fa=ph.kind==='turn'?aiAction(room.data.game,fp):{act:'claim',choice:null},fm=command(fws,fa);
const durableBefore=clone(stored);failNextSave=true;
await assert.rejects(room.receive(fws,JSON.stringify(fm)),/temporary storage failure/);
assert.deepEqual(stored,durableBefore,'failed write is not durable');
assert(!fws.messages.some(m=>m.type==='ack'&&m.id===fm.id),'failed write must not acknowledge');
const appliedOnce=clone(room.data.game);await room.receive(fws,JSON.stringify(fm));
assert.deepEqual(stored.game,appliedOnce,'same-ID retry persists before ACK');assert.equal(fws.messages.at(-1).ok,true);
room=new RoomController(io,stored);await room.receive(fws,JSON.stringify(fm));assert.deepEqual(room.data.game,appliedOnce,'retry after storage recovery and eviction executes once');
console.log('CONTROLLER_OK: persistence, concurrent duplicate, restart retry, old-socket close race, stale rejection with snapshot, forged state rejection');
console.log('STORAGE_RECOVERY_OK: failed write is not acknowledged; retry makes receipt durable before ACK; eviction cannot execute it again');
