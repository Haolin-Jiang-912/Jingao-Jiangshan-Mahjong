/* Local Node server uses the same authoritative controller as Cloudflare. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),WebSocket=require('ws');
const PORT=process.env.PORT||3001,ROOT=__dirname;
const allowed=new Set(['index.html','game.html','style.css','lobby.js','experience.js','engine.js','ui.js','net.js','app.js','campus-cover.png','school-desks.png','sprite-jiejie.png','avatar-chaochao.png','avatar-hanhan.png','avatar-linlin.png','avatar-zhengzheng.png','bgm-1.mp3','bgm-2.mp3','bgm-3.mp3']);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.mp3':'audio/mpeg'};
(async()=>{
  const {RoomController}=await import('./room-controller.mjs'),rooms=new Map();
  const server=http.createServer((req,res)=>{
    let p;try{p=decodeURIComponent(new URL(req.url,'http://local').pathname);}catch{res.writeHead(400);res.end();return;}
    if(p==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,protocol:2,authority:'server'}));return;}
    const file=p==='/'?'index.html':p.slice(1);if(!allowed.has(file)){res.writeHead(404);res.end('Not found');return;}
    fs.readFile(path.join(ROOT,file),(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:data);});
  });
  const wss=new WebSocket.Server({server,maxPayload:32768});
  wss.on('connection',(ws,req)=>{
    const u=new URL(req.url,'http://local'),id=(u.searchParams.get('room')||'').trim().toUpperCase();
    if(!/^[A-Z0-9]{4,8}$/.test(id)){ws.close(1008,'Invalid room');return;}u.searchParams.set('room',id);
    if(!rooms.has(id)){
      const sockets=new Set();let timer=null,controller;
      controller=new RoomController({sockets:()=>[...sockets],save:async()=>{},schedule:async time=>{clearTimeout(timer);if(time)timer=setTimeout(()=>controller.alarm().catch(console.error),Math.max(1,time-Date.now()));},clear:async()=>{clearTimeout(timer);rooms.delete(id);}});
      rooms.set(id,{controller,sockets});
    }
    const {controller,sockets}=rooms.get(id);let meta=null;ws.serializeAttachment=value=>{meta=value;};ws.deserializeAttachment=()=>meta;sockets.add(ws);
    ws.on('message',data=>controller.receive(ws,data.toString()).catch(console.error));
    ws.on('close',()=>{sockets.delete(ws);controller.disconnected(ws).catch(console.error);});ws.on('error',()=>{});
    controller.join(ws,u.searchParams).catch(e=>{console.error(e);ws.close(1011,'Room error');});
  });
  server.listen(PORT,()=>console.log('Authoritative mahjong server: http://localhost:'+PORT));
})().catch(e=>{console.error(e);process.exitCode=1;});
