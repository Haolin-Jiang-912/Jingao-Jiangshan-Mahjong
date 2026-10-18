// Exercise the actual WebSocket protocol against local Cloudflare or production.
const WebSocket=require('ws'),assert=require('node:assert/strict');
const base=process.env.TEST_WS_URL||'ws://127.0.0.1:8787';
const room='T'+Math.random().toString(36).slice(2,7).toUpperCase(),peers=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(role,name,token){
  const qs=new URLSearchParams({room,role,name,mode:'ju',...(token?{token}:{})});
  const ws=new WebSocket(base+'?'+qs),messages=[];peers.push(ws);
  ws.on('message',raw=>messages.push(JSON.parse(raw)));
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  async function wait(type){
    for(let n=0;n<100;n++){const i=messages.findIndex(m=>m.type===type);if(i>=0)return messages.splice(i,1)[0];await sleep(50);}
    throw new Error('timeout '+type+': '+JSON.stringify(messages));
  }
  return {ws,messages,wait,send:m=>ws.send(JSON.stringify(m))};
}
(async()=>{
  const httpBase=base.replace(/^ws/,'http');
  for(const route of ['/','/game.html','/style.css','/school-desks.png','/health']){
    const response=await fetch(httpBase+route,{method:'HEAD'});assert.equal(response.status,200,'HTTP route '+route);
  }
  const host=await connect('host','房主'),h=await host.wait('welcome');assert.equal(h.pid,0);
  const a=await connect('client','同学甲'),wa=await a.wait('welcome');
  const b=await connect('client','同学乙'),wb=await b.wait('welcome');assert.equal(wa.mode,'ju');assert.notEqual(wa.pid,wb.pid);
  host.send({type:'state',toPid:wa.pid,G:{private:'only-a'}});assert.equal((await a.wait('state')).G.private,'only-a');
  await sleep(100);assert.equal(b.messages.some(m=>m.type==='state'),false,'private state stays private');
  a.send({type:'state',G:{forged:true}});await sleep(100);assert.equal(b.messages.some(m=>m.G?.forged),false,'client cannot forge host');
  a.send({type:'action',pid:wb.pid,action:{act:'discard',tile:'东'}});assert.equal((await host.wait('action')).fromPid,wa.pid);
  a.ws.close();await host.wait('leave');
  const resumed=await connect('client','改名',wa.token),wr=await resumed.wait('welcome');assert.equal(wr.pid,wa.pid);assert.equal(wr.token,wa.token);
  host.send({type:'start',names:['房主','同学甲','同学乙',null]});await b.wait('start');
  const late=await connect('client','迟到');assert.match((await late.wait('error')).text,/开局/);
  console.log('NETWORK_OK: room creation, seats, mode, private routing, spoof rejection, reconnect, started-room guard');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const ws of peers)ws.close();setTimeout(()=>process.exit(process.exitCode||0),100);});
