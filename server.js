/* 鸡歪麻将厅 · WebSocket 联机中继服务器（Node.js）
 * 职责：房间管理 + 消息转发。游戏逻辑仍由房主浏览器权威执行。
 * 启动：node server.js
 * 部署：可部署到任何支持 Node 的平台（Render/Railway/自己 VPS）。
 * 特性：会话 token 身份保持 + 掉线 90 秒重连宽限（房主/客人均可恢复原座位）。
 */
const WebSocket = require('ws');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;
const HEARTBEAT_MS = 30000;
const RECONNECT_GRACE_MS = 90000; // 掉线后保留座位 90 秒
const ROOT = __dirname;

const MIME={
  '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.svg':'image/svg+xml',
  '.mp3':'audio/mpeg','.ico':'image/x-icon','.json':'application/json','.woff2':'font/woff2'
};

const rooms = new Map(); // roomId -> {clients:Map(ws->meta), hostWs, mode, gone:Map(token->meta), graceTimer}

function makeToken(){return Math.random().toString(36).slice(2,10)+Date.now().toString(36);}

function getRoom(id){
  if(!rooms.has(id)) rooms.set(id,{clients:new Map(),hostWs:null,mode:'p8',gone:{},graceTimer:null});
  return rooms.get(id);
}

function roomNames(room){
  const names=[null,null,null,null];
  // 在线玩家
  room.clients.forEach((m,ws)=>{
    if(m.pid>=0&&m.pid<=3) names[m.pid]=m.name;
  });
  // 掉线宽限期内的玩家占位保留
  Object.values(room.gone||{}).forEach(g=>{
    if(g.pid>=0&&g.pid<=3&&names[g.pid]==null) names[g.pid]=g.name;
  });
  if(names[0]==null)names[0]='房主';
  return names;
}

function lobbyMsg(room,roomId){
  const names=roomNames(room);
  return {type:'lobby',count:names.filter(Boolean).length,players:names,max:4,room:roomId};
}

function broadcast(room, msg, exclude=null){
  const s=JSON.stringify(msg);
  room.clients.forEach((meta,ws)=>{
    if(ws!==exclude && ws.readyState===WebSocket.OPEN){
      try{ws.send(s);}catch(e){}
    }
  });
}

function send(ws, msg){
  if(ws && ws.readyState===WebSocket.OPEN){
    try{ws.send(JSON.stringify(msg));}catch(e){}
  }
}

function heartbeat(ws){
  ws.isAlive=true;
}

function rememberGone(room, meta){
  room.gone=room.gone||{};
  const rec={pid:meta.pid,name:meta.name,role:meta.role};
  rec.timer=setTimeout(()=>{
    if(room.gone&&room.gone[meta.token]) delete room.gone[meta.token];
  },RECONNECT_GRACE_MS);
  room.gone[meta.token]=rec;
}

const server = http.createServer((req,res)=>{
  const parsed=url.parse(req.url,true);
  if(parsed.pathname==='/health'){res.writeHead(200,{'Content-Type':'text/plain'});res.end('ok');return;}

  let filePath=decodeURIComponent(parsed.pathname);
  if(filePath==='/'||filePath==='') filePath='/index.html';
  const safePath=path.normalize(path.join(ROOT,filePath));
  if(!safePath.startsWith(ROOT.replace(/\\$/,''))){
    res.writeHead(403,{'Content-Type':'text/plain'});res.end('Forbidden');return;
  }

  fs.readFile(safePath,(err,data)=>{
    if(err){
      if(err.code==='ENOENT'){
        res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});
        res.end('Not found: '+filePath);
      }else{
        res.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'});
        res.end('Server error');
      }
      return;
    }
    const ext=path.extname(safePath).toLowerCase();
    res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream','Cache-Control':'no-cache, no-store, must-revalidate'});
    res.end(data);
  });
});

const wss = new WebSocket.Server({server});

wss.on('connection',(ws, req)=>{
  ws.isAlive=true;
  ws.on('pong',()=>heartbeat(ws));

  const parsed=url.parse(req.url||'',true);
  const roomId=(parsed.query.room||'').trim().toUpperCase();
  const role=parsed.query.role || parsed.query.net; // host / client
  const name=decodeURIComponent(parsed.query.name||'玩家').slice(0,8)||'玩家';
  const mode=parsed.query.mode==='ju'?'ju':'p8';
  const reqToken=(parsed.query.token||'').trim();

  if(!roomId){send(ws,{type:'error',text:'缺少房间号'});ws.close();return;}
  if(!role || (role!=='host' && role!=='client')){send(ws,{type:'error',text:'缺少角色(role=host|client)'});ws.close();return;}

  const room=getRoom(roomId);
  room.mode=mode;

  let meta=null;

  /* --- 会话恢复：token 匹配的掉线玩家重新入座（保持原 pid/座位） --- */
  if(reqToken && room.gone && room.gone[reqToken]){
    const g=room.gone[reqToken];
    if(g.timer){clearTimeout(g.timer);g.timer=null;}
    delete room.gone[reqToken];
    meta={pid:g.pid,name:g.name,role:g.role,token:reqToken};
    if(g.role==='host'){
      if(room.hostWs && room.hostWs.readyState===WebSocket.OPEN){
        send(ws,{type:'error',text:'房主已在别处连接'});ws.close();return;
      }
      if(room.graceTimer){clearTimeout(room.graceTimer);room.graceTimer=null;}
      room.hostWs=ws;
      room.clients.set(ws,meta);
      send(ws,{type:'welcome',pid:0,names:roomNames(room),mode:room.mode,token:reqToken});
      broadcast(room,{type:'notify',text:'房主已重新连接'});
      broadcast(room,lobbyMsg(room,roomId));
    }else{
      if(!room.hostWs || room.hostWs.readyState!==WebSocket.OPEN){
        send(ws,{type:'error',text:'房主不在线，无法恢复连接'});ws.close();return;
      }
      room.clients.set(ws,meta);
      send(room.hostWs,{type:'rejoin',pid:meta.pid,name:meta.name});
      broadcast(room,lobbyMsg(room,roomId));
      send(ws,{type:'welcome',pid:meta.pid,names:roomNames(room),mode:room.mode,token:reqToken});
    }
  }

  /* --- 正常入座 --- */
  if(!meta){
    if(role==='host'){
      if(room.hostWs && room.hostWs.readyState===WebSocket.OPEN){
        send(ws,{type:'error',text:'房间 '+roomId+' 已存在房主，请换一个房间号'});ws.close();return;
      }
      if(room.graceTimer){clearTimeout(room.graceTimer);room.graceTimer=null;}
      const tk=makeToken();
      meta={pid:0,name,role:'host',token:tk};
      room.hostWs=ws;
      room.clients.set(ws,meta);
      send(ws,{type:'welcome',pid:0,names:roomNames(room),mode,token:tk});
      broadcast(room,lobbyMsg(room,roomId));
    }else{
      if(!room.hostWs || room.hostWs.readyState!==WebSocket.OPEN){
        send(ws,{type:'error',text:'房间 '+roomId+' 不存在，请确认房主已创房'});ws.close();return;
      }
      const used=new Set([0]);
      room.clients.forEach(m=>used.add(m.pid));
      Object.values(room.gone||{}).forEach(g=>used.add(g.pid)); // 宽限期内座位保留
      let pid=1; while(used.has(pid)&&pid<4) pid++;
      if(pid>3){send(ws,{type:'error',text:'房间已满'});ws.close();return;}
      const tk=makeToken();
      meta={pid,name,role:'client',token:tk};
      room.clients.set(ws,meta);
      send(room.hostWs,{type:'join',pid,name});
      broadcast(room,lobbyMsg(room,roomId));
      send(ws,{type:'welcome',pid,names:roomNames(room),mode,token:tk});
    }
  }

  ws.on('message', data=>{
    let msg; try{msg=JSON.parse(data);}catch(e){return;}
    const meta=room.clients.get(ws);
    if(!meta) return;

    // 客户端 -> 房主
    if(meta.role==='client'){
      if(['action','claimResponse','rename','sync','ack'].includes(msg.type)){
        if(room.hostWs && room.hostWs.readyState===WebSocket.OPEN){
          send(room.hostWs,Object.assign({},msg,{fromPid:meta.pid}));
        }
        return;
      }
    }

    // 房主 -> 客户端（广播）
    if(meta.role==='host'){
      if(['state','turn','claimOffer','start','modal','notify','lobby','welcome','broadcast'].includes(msg.type)){
        broadcast(room,msg,ws);
        return;
      }
    }

    // 通用转发（任意 -> 同房间其它人）
    broadcast(room,Object.assign({},msg,{fromPid:meta.pid}),ws);
  });

  ws.on('close',()=>{
    const meta=room.clients.get(ws);
    if(!meta) return;
    room.clients.delete(ws);

    if(meta.role==='host'){
      /* 房主掉线：宽限 90 秒等待重连，期间房间和客人全部保留 */
      room.hostWs=null;
      broadcast(room,{type:'notify',text:'房主掉线，'+Math.round(RECONNECT_GRACE_MS/1000)+' 秒内重新连接可继续对局'});
      rememberGone(room,meta);
      if(room.graceTimer)clearTimeout(room.graceTimer);
      room.graceTimer=setTimeout(()=>{
        broadcast(room,{type:'notify',text:'房主离开，房间已关闭'});
        room.clients.forEach((m,cws)=>{try{cws.close();}catch(e){}});
        rooms.delete(roomId);
      },RECONNECT_GRACE_MS);
    }else{
      if(room.hostWs && room.hostWs.readyState===WebSocket.OPEN){
        send(room.hostWs,{type:'leave',pid:meta.pid});
      }
      rememberGone(room,meta); // 座位保留 90 秒
      broadcast(room,lobbyMsg(room,roomId));
    }
  });

  ws.on('error',()=>{});
});

// 心跳清理僵尸连接
const interval = setInterval(()=>{
  wss.clients.forEach(ws=>{
    if(!ws.isAlive){try{ws.terminate();}catch(e){}return;}
    ws.isAlive=false; ws.ping();
  });
  // 清理彻底空掉的房间（无在线玩家、无掉线保留、无房主宽限）
  rooms.forEach((room,id)=>{
    if(room.clients.size===0 && !room.graceTimer && Object.keys(room.gone||{}).length===0) rooms.delete(id);
  });
}, HEARTBEAT_MS);

wss.on('close',()=>clearInterval(interval));

server.listen(PORT,()=>{
  console.log('鸡歪麻将厅 WS 服务器已启动');
  console.log('端口：'+PORT);
  console.log('健康检查：http://localhost:'+PORT+'/health');
});
