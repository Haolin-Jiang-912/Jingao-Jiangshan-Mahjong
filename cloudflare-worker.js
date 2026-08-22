/* 鸡歪麻将厅 · Cloudflare Workers / PartyKit 兼容版联机服务器
 * 使用 Cloudflare Durable Object 做房间管理，消息转发逻辑与 server.js 一致。
 * 部署：wrangler deploy，需配置 Durable Object 绑定名 MAHJONG_ROOMS。
 */

const HEARTBEAT_MS = 30000;

export class MahjongRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // ws -> {pid,name,role}
    this.host = null;
    this.mode = 'p8';
  }

  roomNames() {
    const names = [this.host && this.sessions.get(this.host) ? this.sessions.get(this.host).name : '房主', null, null, null];
    this.sessions.forEach((meta, ws) => {
      if (ws !== this.host && meta.pid >= 1 && meta.pid <= 3) names[meta.pid] = meta.name;
    });
    return names;
  }

  broadcast(msg, exclude = null) {
    const s = JSON.stringify(msg);
    this.sessions.forEach((meta, ws) => {
      if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
        try { ws.send(s); } catch (e) { }
      }
    });
  }

  send(ws, msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(msg)); } catch (e) { }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const roomId = (url.searchParams.get('room') || '').trim().toUpperCase();
    const role = url.searchParams.get('role') || url.searchParams.get('net');
    const name = decodeURIComponent(url.searchParams.get('name') || '玩家').slice(0, 8) || '玩家';
    const mode = url.searchParams.get('mode') === 'ju' ? 'ju' : 'p8';

    if (!roomId) return new Response('Missing room', { status: 400 });
    if (!role || (role !== 'host' && role !== 'client')) return new Response('Missing role=host|client', { status: 400 });

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();

    if (role === 'host') {
      if (this.host && this.host.readyState === WebSocket.OPEN) {
        this.send(server, { type: 'error', text: '房间 ' + roomId + ' 已存在房主' });
        server.close();
        return new Response(null, { status: 101, webSocket: client });
      }
      this.host = server;
      this.mode = mode;
      this.sessions.set(server, { pid: 0, name, role: 'host' });
      this.send(server, { type: 'welcome', pid: 0, names: [name, null, null, null], mode });
      this.broadcast({ type: 'lobby', count: 1, players: [name, null, null, null], max: 4, room: roomId });
    } else {
      if (!this.host || this.host.readyState !== WebSocket.OPEN) {
        this.send(server, { type: 'error', text: '房间 ' + roomId + ' 不存在，请确认房主已创房' });
        server.close();
        return new Response(null, { status: 101, webSocket: client });
      }
      const used = new Set([0]);
      this.sessions.forEach(m => used.add(m.pid));
      let pid = 1; while (used.has(pid) && pid < 4) pid++;
      if (pid > 3) {
        this.send(server, { type: 'error', text: '房间已满' });
        server.close();
        return new Response(null, { status: 101, webSocket: client });
      }
      this.sessions.set(server, { pid, name, role: 'client' });
      this.send(this.host, { type: 'join', pid, name });
      const names = this.roomNames();
      this.broadcast({ type: 'lobby', count: names.filter(Boolean).length, players: names, max: 4, room: roomId });
      this.send(server, { type: 'welcome', pid, names, mode: this.mode });
    }

    server.addEventListener('message', event => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }
      const meta = this.sessions.get(server);
      if (!meta) return;

      if (meta.role === 'client') {
        if (['action', 'claimResponse', 'rename', 'sync', 'ack'].includes(msg.type)) {
          if (this.host && this.host.readyState === WebSocket.OPEN) {
            this.send(this.host, Object.assign({}, msg, { fromPid: meta.pid }));
          }
          return;
        }
      }

      if (meta.role === 'host') {
        if (['state', 'turn', 'claimOffer', 'start', 'modal', 'notify', 'lobby', 'welcome', 'broadcast'].includes(msg.type)) {
          this.broadcast(msg, server);
          return;
        }
      }
      this.broadcast(Object.assign({}, msg, { fromPid: meta.pid }), server);
    });

    server.addEventListener('close', () => {
      const meta = this.sessions.get(server);
      if (!meta) return;
      this.sessions.delete(server);
      if (meta.role === 'host') {
        this.broadcast({ type: 'notify', text: '房主离开，房间已关闭' });
        this.sessions.forEach((m, ws) => { try { ws.close(); } catch (e) { } });
        this.sessions.clear();
        this.host = null;
      } else {
        if (this.host && this.host.readyState === WebSocket.OPEN) {
          this.send(this.host, { type: 'leave', pid: meta.pid });
        }
        const names = this.roomNames();
        this.broadcast({ type: 'lobby', count: names.filter(Boolean).length, players: names, max: 4, room: roomId });
      }
    });

    server.addEventListener('error', () => { });

    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const roomId = (url.searchParams.get('room') || '').trim().toUpperCase();
    if (!roomId) return new Response('Missing room', { status: 400 });
    const id = env.MAHJONG_ROOMS.idFromName(roomId);
    const room = env.MAHJONG_ROOMS.get(id);
    return room.fetch(request);
  }
};

