import {createGame,applyAction,tickGame,nextWake,seatState,assertGame} from './game-core.mjs';
export const PROTOCOL=2,GRACE=90000;
const clone=x=>JSON.parse(JSON.stringify(x));
export class RoomController {
  constructor(adapter,data={}){
    this.io=adapter;this.data={protocol:PROTOCOL,epoch:crypto.randomUUID(),seq:0,room:'',mode:'p8',seats:{},game:null,receipts:{},offlineAt:{},...data};this.tail=Promise.resolve();
  }
  serial(fn){const promise=this.tail.then(fn);this.tail=promise.catch(()=>{});return promise;}
  sockets(){return this.io.sockets().filter(ws=>ws.readyState===1&&ws.deserializeAttachment());}
  meta(ws){return ws.deserializeAttachment();}
  online(){return [...new Set(this.sockets().map(ws=>this.meta(ws).pid))];}
  names(){const names=['林林','超超','含含','政政'];for(const m of Object.values(this.data.seats))names[m.pid]=m.name;return names;}
  send(ws,msg){if(ws?.readyState===1)try{ws.send(JSON.stringify(msg));}catch{}}
  snapshot(pid){return {type:'state',protocol:PROTOCOL,epoch:this.data.epoch,seq:this.data.seq,room:this.data.room,mode:this.data.mode,names:this.names(),players:[0,1,2,3].map(p=>Object.values(this.data.seats).find(m=>m.pid===p)?.name||null),online:this.online(),G:this.data.game?seatState(this.data.game,pid):null};}
  broadcast(){for(const ws of this.sockets())this.send(ws,this.snapshot(this.meta(ws).pid));}
  async save(changed=true){
    if(changed)this.data.seq++;
    if(this.data.game)assertGame(this.data.game);
    await this.io.save(clone(this.data));
    const now=Date.now(),times=Object.values(this.data.seats).filter(m=>m.expires).map(m=>m.expires);
    if(this.data.game){const wake=nextWake(this.data.game,this.online(),now,this.data.offlineAt);if(wake)times.push(wake);}
    await this.io.schedule(times.length?Math.min(...times):null);
  }
  advance(){let changed=false;for(let n=0;n<12&&this.data.game&&tickGame(this.data.game,this.online(),Date.now(),this.data.offlineAt);n++)changed=true;return changed;}
  join(ws,params){return this.serial(async()=>{
    const role=params.get('role'),room=params.get('room'),token=params.get('token');
    const reject=text=>{this.send(ws,{type:'error',text});ws.close(1008,'Cannot join');};
    if(params.get('protocol')!==String(PROTOCOL))return reject('游戏已升级，请刷新页面再进入');
    if(!/^[A-Z0-9]{4,8}$/.test(room||'')||!['host','client'].includes(role))return reject('房间信息无效');
    const now=Date.now();for(const [key,m] of Object.entries(this.data.seats))if(m.expires&&m.expires<=now)delete this.data.seats[key];
    let meta=token&&this.data.seats[token];
    if(meta){
      if(meta.role!==role)return reject('身份与座位不匹配，请重新进入');
      for(const old of this.sockets())if(this.meta(old).token===token){old.serializeAttachment(null);old.close(4001,'Session replaced');}
      meta={...meta,expires:null};
    }else{
      if(this.data.game)return reject('牌局已开始，请使用原来的邀请页面恢复座位');
      const occupied=Object.values(this.data.seats).map(m=>m.pid);
      let pid=role==='host'?0:[1,2,3].find(p=>!occupied.includes(p));
      if(role==='host'&&occupied.includes(0))return reject('房间已存在，请换一个房间号');
      if(role==='client'&&!occupied.includes(0))return reject('房间不存在，请确认房间号');
      if(pid===undefined)return reject('房间已满');
      if(role==='host')this.data.mode=params.get('mode')==='ju'?'ju':'p8';
      meta={pid,role,name:(params.get('name')||'玩家').trim().slice(0,8)||'玩家',token:crypto.randomUUID(),expires:null};
    }
    ws.serializeAttachment(meta);this.data.seats[meta.token]=meta;this.data.room=room;
    delete this.data.offlineAt[meta.pid];
    this.advance();await this.save();
    this.send(ws,{type:'welcome',protocol:PROTOCOL,pid:meta.pid,token:meta.token,snapshot:this.snapshot(meta.pid)});this.broadcast();
  });}
  receive(ws,raw){return this.serial(async()=>{
    const meta=this.meta(ws);if(!meta||typeof raw!=='string'||raw.length>32768)return;
    let msg;try{msg=JSON.parse(raw);}catch{return;}
    if(!msg||typeof msg!=='object'||Array.isArray(msg))return;
    if(msg.type==='sync'||msg.type==='ping'){this.send(ws,this.snapshot(meta.pid));return;}
    if(msg.type==='rename'&&!this.data.game){
      meta.name=String(msg.name||'玩家').trim().slice(0,8)||'玩家';ws.serializeAttachment(meta);this.data.seats[meta.token]=meta;await this.save();this.broadcast();return;
    }
    if(msg.type!=='command')return; // Clients never relay state or execute game logic.
    if(typeof msg.id!=='string'||msg.id.length>96)return;
    const key=meta.token+':'+msg.id,old=this.data.receipts[key];
    // A previous write may have failed before ACK. A retry must make the
    // in-memory receipt durable before telling the client it was accepted.
    if(old){await this.save(false);this.send(ws,{type:'ack',id:msg.id,...old,snapshot:this.snapshot(meta.pid)});return;}
    let error=null;
    try{
      if(msg.protocol!==PROTOCOL)throw new Error('请刷新页面升级游戏');
      if(msg.action?.act==='start'){
        if(meta.pid!==0||this.data.game)throw new Error('只有房主可以开始尚未开局的房间');
        if(this.online().length<2)throw new Error('至少需要两位同学在线');
        this.data.game=createGame(this.data.mode,this.online());
      }else{
        const g=this.data.game;if(!g)throw new Error('牌局尚未开始');
        if(msg.epoch!==this.data.epoch||msg.decision!==g.phase.id)throw new Error('牌局已变化，已为你同步，请重新选择');
        // Validate on a copy, so a rejected command cannot partly mutate a game.
        const draft=clone(g);applyAction(draft,meta.pid,msg.action);assertGame(draft);this.data.game=draft;
      }
      this.advance();
    }catch(e){error=e.message||'操作未生效，请重新同步';}
    const receipt={ok:!error,...(error?{error}:{})};this.data.receipts[key]=receipt;
    const keys=Object.keys(this.data.receipts);for(const k of keys.slice(0,Math.max(0,keys.length-256)))delete this.data.receipts[k];
    await this.save(!error);
    this.send(ws,{type:'ack',id:msg.id,...receipt,snapshot:this.snapshot(meta.pid)});if(!error)this.broadcast();
  });}
  disconnected(ws){return this.serial(async()=>{
    const meta=this.meta(ws);if(!meta)return;ws.serializeAttachment(null);
    // The old socket's close event may arrive after its replacement has joined.
    if(this.sockets().some(other=>this.meta(other).token===meta.token))return;
    this.data.offlineAt[meta.pid]=Date.now();
    this.data.seats[meta.token]={...meta,expires:Date.now()+GRACE};
    this.advance();await this.save();this.broadcast();
  });}
  alarm(){return this.serial(async()=>{
    const now=Date.now();for(const [token,m] of Object.entries(this.data.seats))if(m.expires&&m.expires<=now)delete this.data.seats[token];
    if(!Object.keys(this.data.seats).length&&!this.sockets().length){await this.io.clear();return;}
    this.advance();await this.save();this.broadcast();
  });}
}
