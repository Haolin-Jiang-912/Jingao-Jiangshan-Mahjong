/* All seats are clients of the cloud's authoritative game. No browser runs a
 * second multiplayer game. Commands are acknowledged and retry with one ID. */
(function(){
  const Net={active:false,serverAuthoritative:true,isHost:false,pid:-1,room:'',mode:'p8',names:['林林','超超','含含','政政'],online:[],
    ws:null,ready:false,pending:null,epoch:null,seq:-1,retries:0,lastSeen:0,_timer:null,_retry:null,_fatal:false,_resultKey:null,
    init(params){
      this.room=(params.get('room')||'').trim().toUpperCase();const role=params.get('role')||params.get('net');if(!this.room||!role)return;
      this.active=true;this.isHost=role==='host';
      if(!/^[A-Z0-9]{4,8}$/.test(this.room)||!['host','client'].includes(role)){this._fatal=true;return;}
      this.role=role;this.mode=params.get('mode')==='ju'?'ju':'p8';this.myName=(params.get('name')||'玩家').slice(0,8);
      this.storageKey='jw-v2-token-'+this.room+'-'+role;try{this.token=sessionStorage.getItem(this.storageKey)||'';}catch{this.token='';}
      this.wsUrl=params.get('ws')||((location.protocol==='https:'?'wss://':'ws://')+location.host);
      this.connect();this._timer=setInterval(()=>this.maintain(),2000);
    },
    status(text){const e=$('#netStatus');if(e)e.textContent=text;},
    updateControls(){
      if(G&&G.h&&typeof renderHandControls==='function')renderHandControls();
      for(const b of document.querySelectorAll?.('#actionBar button,#modalBtns button[data-m]')||[])b.disabled=!this.ready||!!this.pending;
    },
    connect(){
      if(this._fatal)return;clearTimeout(this._retry);this.ready=false;this.updateControls();
      const previous=this.ws;this.ws=null;if(previous)try{previous.close();}catch{}
      this.status(this.retries?'重新连接并同步牌局…':'正在连接云端牌桌…');
      const u=new URL(this.wsUrl);u.search=new URLSearchParams({room:this.room,role:this.role,name:this.myName,mode:this.mode,protocol:2,...(this.token?{token:this.token}:{})}).toString();
      let ws;try{ws=new WebSocket(u.toString());}catch{this.reconnect();return;}this.ws=ws;
      ws.onopen=()=>{if(this.ws===ws)this.lastSeen=Date.now();};
      ws.onmessage=e=>{if(this.ws!==ws)return;let m;try{m=JSON.parse(e.data);}catch{return;}this.lastSeen=Date.now();this.dispatch(m);};
      ws.onerror=()=>{};
      ws.onclose=e=>{if(this.ws!==ws)return;this.ready=false;this.updateControls();
        if(e.code===4001){this._fatal=true;this.status('此座位已在另一页面打开');note('座位已切换到另一页面，请在那个页面继续。');return;}
        if(!this._fatal)this.reconnect();
      };
    },
    reconnect(){
      if(this._retry||this._fatal)return;this.ready=false;this.updateControls();this.status('连接中断，正在恢复同一牌局…');
      const delay=Math.min(15000,1000*2**Math.min(this.retries++,4));
      this._retry=setTimeout(()=>{this._retry=null;this.connect();},delay);
    },
    raw(msg){if(this.ws?.readyState!==1)return false;try{this.ws.send(JSON.stringify(msg));return true;}catch{return false;}},
    maintain(){
      if(!this.active||this._fatal)return;
      if(this.ws?.readyState===1){
        if(Date.now()-this.lastSeen>12000){this.ready=false;this.updateControls();this.connect();return;}
        if(this.pending&&Date.now()-this.pending.sentAt>2000){this.pending.sentAt=Date.now();this.raw(this.pending.message);}
        this.raw({type:'sync'});
      }else if(!this._retry)this.reconnect();
    },
    dispatch(m){
      if(m.type==='error'){this._fatal=true;this.ready=false;this.status(m.text||'房间已结束');this.updateControls();
        showModal('<h3>暂时无法进入牌桌</h3><p>'+escapeHTML(m.text||'请重新进入')+'</p>',[{label:'返回大厅',fn:()=>location.href='index.html'}]);return;}
      if(m.type==='welcome'){
        if(m.protocol!==2){this._fatal=true;this.status('请刷新页面升级游戏');return;}
        this.pid=m.pid;this.token=m.token;try{sessionStorage.setItem(this.storageKey,this.token);}catch{}
        this.ready=true;this.retries=0;this.applyState(m.snapshot);
        // A lost ACK is recovered by resending exactly the original command.
        if(this.pending){this.pending.sentAt=Date.now();this.raw(this.pending.message);}
      }else if(m.type==='state'){this.ready=true;this.applyState(m);}
      else if(m.type==='ack'){
        const mine=this.pending?.message.id===m.id;
        if(mine)this.pending=null;
        this.applyState(m.snapshot);
        if(mine&&!m.ok)note(m.error||'操作没有生效，已同步，请重新选择');
        this.updateControls();
      }
    },
    applyState(s){
      if(!s||s.protocol!==2||this.pid<0)return;
      if(this.epoch===s.epoch&&s.seq<this.seq)return;
      const oldDecision=G?.phase?.id,oldWarning=G?.h?.warnWealth,oldSeq=this.seq,oldEpoch=this.epoch;
      this.epoch=s.epoch;this.seq=s.seq;this.names=s.names;this.online=s.online;this.mode=s.mode;
      if(!s.G){this.showLobby(s);this.status('房间 '+this.room+' · 云端已同步');return;}
      G=this.rotateG(s.G,this.pid);for(let i=0;i<4;i++)NAMES[i]=this.names[(this.pid+i)%4];
      if(oldDecision===G.phase.id&&oldWarning)G.h.warnWealth=true;
      // Duplicate heartbeat snapshots do not rebuild hand buttons or steal focus.
      if(oldEpoch!==s.epoch||oldSeq!==s.seq||oldDecision!==G.phase.id)renderAll();
      this.renderPhase();this.status(this.pending?'确认操作中':'已同步');
      const status=$('#netStatus');if(status)status.title='房间 '+this.room+' · 版本 '+this.seq;
    },
    rotateG(g,p){
      const out=JSON.parse(JSON.stringify(g)),at=i=>(p+i)%4;
      out.h.P=[0,1,2,3].map(i=>g.h.P[at(i)]);out.h.discards=[0,1,2,3].map(i=>g.h.discards[at(i)]);
      // Server hands retain draw order; the view uses sorted order. Normalize on
      // EVERY snapshot, including heartbeats that intentionally skip rendering.
      out.h.P[0].hand.sort((a,b)=>valOf(a)-valOf(b));
      out.h.dealer=(g.h.dealer-p+4)%4;out.h.turn=(g.h.turn-p+4)%4;
      if(g.h.dice?.pairs)out.h.dice.pairs=[0,1,2,3].map(i=>g.h.dice.pairs[at(i)]);
      if(out.h.lastDiscard)out.h.lastDiscard.p=(out.h.lastDiscard.p-p+4)%4;
      out.scores=[0,1,2,3].map(i=>g.scores[at(i)]);out.specials=[0,1,2,3].map(i=>g.specials[at(i)]);return out;
    },
    canAct(){return !!(this.ready&&!this.pending&&this.ws?.readyState===1&&G?.phase?.kind==='turn'&&G.phase.actor===this.pid&&!G.h.over);},
    sendAction(action){return this.command(action);},
    command(action){
      if(!this.ready||this.pending||this.ws?.readyState!==1){this.status('正在同步，请稍候再操作');return false;}
      const message={type:'command',protocol:2,id:crypto.randomUUID(),epoch:this.epoch,decision:G?.phase?.id||null,action};
      this.pending={message,sentAt:Date.now()};this.raw(message);this.status('正在等待云端确认…');this.updateControls();return true;
    },
    renderPhase(){
      if(!G)return;const ph=G.phase;
      if(ph.kind==='handEnd'||ph.kind==='matchEnd'){this.renderResult();return;}
      $('#modal').classList.remove('show');this._resultKey=null;
      const actionKey=ph.id+':'+ph.responded+':'+(this.pending?.message.id||'')+':'+this.ready;
      if(this._actionKey===actionKey){this.updateControls();return;}this._actionKey=actionKey;
      if(this.pending){clearActions();note('操作已提交，等待云端确认…');this.updateControls();return;}
      const acts=[];
      if((ph.kind==='claim'||ph.kind==='rob')&&ph.offers.length&&!ph.responded){
        for(const o of ph.offers)acts.push({label:o.act==='qiang'?'抢杠胡':o.act+(o.opt?' '+o.opt.join(' '):''),fn:()=>this.command({act:'claim',choice:o})});
        acts.push({label:'过',fn:()=>this.command({act:'claim',choice:null})});
        note('有人打出 '+ph.tile+'，请选择操作（限时响应）');
      }else if(ph.kind==='turn'&&ph.actor===this.pid){
        for(const o of G.options||[])acts.push({label:o.act==='win'?'胡！':(o.act==='angang'?'暗杠 ':'补杠 ')+o.t,fn:()=>this.command(o)});
        note('轮到你了：点牌只选中，再点「打出」确认');
      }else note(ph.responded?'已响应，等待其他同学…':'等待 '+this.names[ph.actor??ph.from]+' 行牌');
      setActions(acts);this.updateControls();
    },
    renderResult(){
      const ph=G.phase,key=ph.id+':'+ph.ready.join(',')+':'+!!this.pending;if(this._resultKey===key)return;this._resultKey=key;
      const r=G.result;let html='';
      if(r.kind==='match')html='<h3>牌局总结算</h3>'+r.rank.map((p,i)=>'<p>第 '+(i+1)+' 名 · '+escapeHTML(this.names[p])+' · '+r.scores[p]+' 分</p>').join('');
      else if(r.kind==='draw')html='<h3>流局</h3><p>'+escapeHTML(r.text)+'</p>';
      else html='<h3>'+escapeHTML(this.names[r.winner])+(r.robbed===null?' 自摸！':' 抢杠胡！')+'</h3><div class="wintiles">'+r.tiles.map(t=>face(t,'mtile')).join('')+'</div><table class="mtable">'+r.detail.map(d=>'<tr><td>'+escapeHTML(d[0])+'</td><td>'+d[1]+'</td></tr>').join('')+'<tr><td>每家支付</td><td>'+r.paid+' 分</td></tr></table>';
      const ready=ph.ready.includes(this.pid);
      html+='<p>'+(ready?'你已准备，等待其他同学':'所有在线同学确认后继续')+'</p>';
      showModal(html,ready||this.pending?[]:[{label:ph.kind==='matchEnd'?'再来一局':'确认结算，继续',fn:()=>this.command({act:'ready'})}]);
    },
    inviteUrl(){const u=new URL(location.href);u.search=new URLSearchParams({role:'client',room:this.room,mode:this.mode,...(this.wsUrl!==((location.protocol==='https:'?'wss://':'ws://')+location.host)?{ws:this.wsUrl}:{})});return u.toString();},
    showLobby(s){
      const key=s.epoch+':'+s.seq+':'+!!this.pending;if(this._lobbyKey===key)return;this._lobbyKey=key;
      $('#modal').classList.add('show');
      $('#modalBody').innerHTML='<h3>'+ (this.isHost?'课桌已经拼好':'加入同学的牌桌')+'</h3><p>房间号：<strong>'+escapeHTML(this.room)+'</strong></p><p>云端统一发牌和算分 · 2–4 人，空位由 AI 补齐</p><div class="seats">'+s.players.map((name,p)=>'<div class="seat '+(!name?'empty':'')+'"><div class="seat-name">'+escapeHTML(name||'AI 空位')+'</div><div class="seat-status">'+(p===this.pid?'你 · ':'')+(s.online.includes(p)?'已就绪':name?'等待重连':'等待同学')+'</div></div>').join('')+'</div><p class="invite-label">邀请链接</p><input id="inviteLink" class="lobby-input" readonly aria-label="邀请链接" value="'+escapeHTML(this.inviteUrl())+'"><p id="copyStatus" role="status"></p>';
      $('#modalBtns').innerHTML='<button id="copyInvite">复制邀请</button>'+(this.isHost?'<button id="netStart" '+(!this.ready||this.pending||s.online.length<2?'disabled':'')+'>开始游戏</button>':'')+'<button id="netCancel">返回大厅</button>';
      $('#copyInvite').onclick=async()=>{try{await navigator.clipboard.writeText(this.inviteUrl());$('#copyStatus').textContent='已复制，发给同学即可';}catch{$('#inviteLink').select();$('#copyStatus').textContent='请复制上方链接';}};
      if($('#netStart'))$('#netStart').onclick=()=>this.command({act:'start'});
      $('#netCancel').onclick=()=>location.href='index.html';
    }
  };
  window.Net=Net;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Net.active){if(Net.ws?.readyState===1)Net.raw({type:'sync'});else Net.connect();}});
  window.addEventListener('online',()=>{if(Net.active&&!Net.ready)Net.connect();});
  Net.init(new URLSearchParams(location.search));
})();
