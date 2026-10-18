/* Cloudflare hosts both pages and hibernating WebSocket rooms.
 * The host browser runs the rules; no personal machine runs the server. */
const GRACE=90_000;
const CLIENT_TYPES=new Set(['action','claimResponse','rename','sync','ack']);
const HOST_TYPES=new Set(['state','turn','claimOffer','start','modal','notify','lobby']);
export class MahjongRoom {
  constructor(ctx,env){this.ctx=ctx;this.env=env;}
  sockets(){return this.ctx.getWebSockets().filter(ws=>ws.readyState===1&&ws.deserializeAttachment());}
  meta(ws){return ws.deserializeAttachment();}
  host(){return this.sockets().find(ws=>this.meta(ws).role==='host');}
  send(ws,msg){if(ws&&ws.readyState===1)try{ws.send(JSON.stringify(msg));}catch{}}
  broadcast(msg,exclude){for(const ws of this.sockets())if(ws!==exclude)this.send(ws,msg);}
  async records(){
    const records=(await this.ctx.storage.get('seats'))||{};
    for(const [token,m] of Object.entries(records))if(m.expires&&m.expires<=Date.now())delete records[token];
    return records;
  }
  names(records){const names=[null,null,null,null];for(const m of Object.values(records))names[m.pid]=m.name;return names;}
  async lobby(records){
    const players=this.names(records),room=await this.ctx.storage.get('room');
    this.broadcast({type:'lobby',players,count:players.filter(Boolean).length,max:4,room});
  }
  async fetch(request){
    const u=new URL(request.url),room=u.searchParams.get('room'),role=u.searchParams.get('role')||u.searchParams.get('net');
    const pair=new WebSocketPair(),client=pair[0],ws=pair[1];
    this.ctx.acceptWebSocket(ws);
    const reject=text=>{this.send(ws,{type:'error',text});ws.close(1008,'Room unavailable');return new Response(null,{status:101,webSocket:client});};
    const records=await this.records(),token=u.searchParams.get('token');
    let meta=token&&records[token];
    const resumed=!!meta;
    if(meta){
      if(meta.role!==role)return reject('会话与角色不一致，请从首页重新进入');
      for(const old of this.sockets())if(this.meta(old).token===token){old.serializeAttachment(null);old.close(1000,'Session replaced');}
      meta={...meta,expires:null};
    }else{
      const name=(u.searchParams.get('name')||'玩家').trim().slice(0,8)||'玩家';
      if(role==='host'){
        if(Object.values(records).some(m=>m.pid===0))return reject('房间已存在，请换一个房间号');
        await this.ctx.storage.put('mode',u.searchParams.get('mode')==='ju'?'ju':'p8');
        await this.ctx.storage.put('started',false);
        meta={pid:0,name,role,token:crypto.randomUUID(),expires:null};
      }else{
        if(!this.host())return reject('房主尚未在线，请确认房间号');
        if(await this.ctx.storage.get('started'))return reject('这桌已开局，请等待下一局再加入');
        const used=new Set(Object.values(records).map(m=>m.pid));
        let pid=1;while(used.has(pid)&&pid<4)pid++;
        if(pid>3)return reject('房间已满');
        meta={pid,name,role,token:crypto.randomUUID(),expires:null};
      }
    }
    records[meta.token]=meta;ws.serializeAttachment(meta);
    await this.ctx.storage.put({seats:records,room});
    this.send(ws,{type:'welcome',pid:meta.pid,names:this.names(records),mode:await this.ctx.storage.get('mode'),token:meta.token});
    if(role==='client')this.send(this.host(),{type:resumed?'rejoin':'join',pid:meta.pid,name:meta.name});
    else if(resumed)this.broadcast({type:'notify',text:'房主已重新连接'},ws);
    await this.lobby(records);
    return new Response(null,{status:101,webSocket:client});
  }
  async webSocketMessage(ws,raw){
    const meta=this.meta(ws);if(!meta||typeof raw!=='string'||raw.length>65_536)return;
    let msg;try{msg=JSON.parse(raw);}catch{return;}
    if(!msg||typeof msg!=='object'||Array.isArray(msg))return;
    if(meta.role==='client'){
      if(!CLIENT_TYPES.has(msg.type))return;
      if(msg.type==='rename'){
        meta.name=String(msg.name||'玩家').slice(0,8);ws.serializeAttachment(meta);
        const records=await this.records();records[meta.token]=meta;await this.ctx.storage.put('seats',records);await this.lobby(records);
      }
      this.send(this.host(),{...msg,fromPid:meta.pid});return;
    }
    if(!HOST_TYPES.has(msg.type))return;
    if(msg.type==='start')await this.ctx.storage.put('started',true);
    if(msg.type==='lobby'&&Array.isArray(msg.players)){
      const records=await this.records();
      for(const m of Object.values(records))if(typeof msg.players[m.pid]==='string')m.name=msg.players[m.pid].slice(0,8);
      await this.ctx.storage.put('seats',records);
    }
    if(['state','turn','claimOffer'].includes(msg.type)&&!Number.isInteger(msg.toPid))return;
    if(msg.toPid!=null){
      for(const client of this.sockets())if(this.meta(client).pid===msg.toPid)this.send(client,msg);
    }else this.broadcast(msg,ws);
  }
  async webSocketClose(ws){
    const meta=this.meta(ws);if(!meta)return;
    ws.serializeAttachment(null);
    const records=await this.records();records[meta.token]={...meta,expires:Date.now()+GRACE};
    await this.ctx.storage.put('seats',records);
    const expires=Object.values(records).filter(m=>m.expires).map(m=>m.expires);
    await this.ctx.storage.setAlarm(Math.min(...expires));
    if(meta.role==='host')this.broadcast({type:'notify',text:'房主断线，等待重连（保留 90 秒）'});
    else this.send(this.host(),{type:'leave',pid:meta.pid});
    await this.lobby(records);
  }
  async webSocketError(ws){try{ws.close(1011,'Connection error');}catch{}await this.webSocketClose(ws);}
  async alarm(){
    const records=await this.records();
    if(!Object.values(records).some(m=>m.role==='host')){
      this.broadcast({type:'error',text:'房主已离开，房间结束，请回首页重新开桌'});
      for(const ws of this.sockets()){ws.serializeAttachment(null);ws.close(1000,'Room closed');}
      await this.ctx.storage.deleteAll();return;
    }
    await this.ctx.storage.put('seats',records);await this.lobby(records);
    const expires=Object.values(records).filter(m=>m.expires).map(m=>m.expires);
    if(expires.length)await this.ctx.storage.setAlarm(Math.min(...expires));
  }
}
export default {
  async fetch(request,env){
    const u=new URL(request.url);
    if(u.pathname==='/health')return Response.json({ok:true,service:'jingao-mahjong',hosting:'cloudflare'});
    if(request.headers.get('Upgrade')?.toLowerCase()==='websocket'){
      const room=(u.searchParams.get('room')||'').trim().toUpperCase();
      if(!/^[A-Z0-9]{4,8}$/.test(room))return new Response('Invalid room',{status:400});
      if(!['host','client'].includes(u.searchParams.get('role')||u.searchParams.get('net')))return new Response('Invalid role',{status:400});
      u.searchParams.set('room',room);
      return env.MAHJONG_ROOMS.get(env.MAHJONG_ROOMS.idFromName(room)).fetch(new Request(u,request));
    }
    if(u.pathname==='/')u.pathname='/index.html';
    return env.ASSETS.fetch(new Request(u,request));
  }
};
