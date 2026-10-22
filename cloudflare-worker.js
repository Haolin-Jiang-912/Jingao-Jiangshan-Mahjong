import {RoomController} from './room-controller.mjs';
export class MahjongRoom {
  constructor(ctx,env){
    this.ctx=ctx;
    ctx.blockConcurrencyWhile(async()=>{
      const saved=await ctx.storage.get('room-v2');
      this.room=new RoomController({sockets:()=>ctx.getWebSockets(),save:data=>ctx.storage.put('room-v2',data),schedule:time=>time?ctx.storage.setAlarm(time):ctx.storage.deleteAlarm(),clear:()=>ctx.storage.deleteAll()},saved);
    });
  }
  async fetch(request){
    const pair=new WebSocketPair();this.ctx.acceptWebSocket(pair[1]);
    await this.room.join(pair[1],new URL(request.url).searchParams);
    return new Response(null,{status:101,webSocket:pair[0]});
  }
  async webSocketMessage(ws,raw){await this.room.receive(ws,raw);}
  async webSocketClose(ws){await this.room.disconnected(ws);}
  async webSocketError(ws){try{ws.close(1011,'Connection error');}catch{}await this.room.disconnected(ws);}
  async alarm(){await this.room.alarm();}
}
export default {
  async fetch(request,env){
    const u=new URL(request.url);
    if(u.pathname==='/health')return Response.json({ok:true,service:'jingao-mahjong',protocol:2,authority:'server'});
    if(request.headers.get('Upgrade')?.toLowerCase()==='websocket'){
      const room=(u.searchParams.get('room')||'').trim().toUpperCase();
      if(!/^[A-Z0-9]{4,8}$/.test(room))return new Response('Invalid room',{status:400});
      u.searchParams.set('room',room);
      // New namespace key keeps old relay rooms out of the authoritative protocol.
      return env.MAHJONG_ROOMS.get(env.MAHJONG_ROOMS.idFromName('v2:'+room)).fetch(new Request(u,request));
    }
    if(u.pathname==='/')u.pathname='/index.html';
    const response=await env.ASSETS.fetch(new Request(u,request));
    if(response.ok&&/-v\d+\.webp$/.test(u.pathname)){
      const headers=new Headers(response.headers);
      headers.set('Cache-Control','public, max-age=31536000, immutable');
      return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
    }
    return response;
  }
};
