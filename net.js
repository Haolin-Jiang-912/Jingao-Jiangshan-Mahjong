/* 鸡歪麻将厅 · 联机层（WebSocket 服务器中继，房主权威）
 * 替代 PeerJS P2P：浏览器通过 WebSocket 连到同一台服务器，由服务器做房间管理和消息转发。
 * 仍保持“房主权威”架构：游戏状态、AI、结算全在房主浏览器运行，服务器只转发。
 */
(function(){
  const DEF_NAMES=['林林','超超','含含','政政'];

  const Net={
    active:false,isHost:false,pid:-1,room:'',mode:'p8',started:false,
    ws:null,wsUrl:'',
    names:DEF_NAMES.slice(),
    humanSeats:[true,false,false,false],
    myName:'玩家',
    onMessage:null,
    msgQueue:[],_outbox:[],
    diag:{ws:'初始化中',state:'-',lastIn:'-',lastOut:'-',seqIn:0,seqOut:0,err:''},

    log(m){console.log('[Net]',m);},
    status(s){
      const el=document.getElementById('netStatus');if(el)el.textContent=s;
      this.diag.state=s;this.updateDiag();
    },
    updateDiag(){
      const el=document.getElementById('netDiag');if(!el)return;
      el.textContent='连接：'+this.diag.ws+'\n状态：'+this.diag.state+(this.diag.err?'\n'+this.diag.err:'');
    },

    init(params){
      const room=(params.get('room')||'').trim().toUpperCase();
      const role=params.get('role')||params.get('net');
      if(!room||!role)return;
      if(!/^[A-Z0-9]{4,8}$/.test(room)||!['host','client'].includes(role)){location.replace('index.html');return;}
      this.active=true;this.room=room;this.isHost=(role==='host');
      this.mode=params.get('mode')==='ju'?'ju':'p8';
      this.myName=(params.get('name')||'玩家').slice(0,8)||'玩家';
      this.names=[this.isHost?this.myName:'房主',null,null,null];
      if(!this.isHost)this.pid=-1;
      this.token='';this._joined=false;this._fatal=false;this._dc={};
      try{ this.token=sessionStorage.getItem('jw-net-token-'+room)||''; }catch(e){} /* 刷新页面仍可恢复身份 */
      this.wsUrl=this.getWsUrl(params);
      this.connect(0);
    },

    defaultWsUrl(){
      /* 默认与页面同源：部署后（如 Render/natapp）页面和 WebSocket 是同一服务，零配置 */
      if(location.protocol==='https:')return 'wss://'+location.host;
      return 'ws://'+location.host;
    },

    getWsUrl(params){
      /* 优先级：链接显式 ws 参数 > localStorage 调试覆盖 > 同源默认 */
      let u=params.get('ws');
      if(u){
        if(!/^wss?:\/\//i.test(u)) u=(location.protocol==='https:'?'wss://':'ws://')+u;
        return u;
      }
      try{
        const saved=localStorage.getItem('jw-ws-override');
        if(saved&&/^wss?:\/\//i.test(saved))return saved;
      }catch(e){}
      return this.defaultWsUrl();
    },

    connect(retryCount=0){
      const reconnect=retryCount>0;
      this.status(reconnect?('重连中（第 '+retryCount+' 次）…'):'连接服务器…');
      this.diag.ws='连接 '+this.wsUrl.replace(/^wss?:\/\//,'');
      this.updateDiag();
      const qs='room='+this.room+'&role='+(this.isHost?'host':'client')
        +'&name='+encodeURIComponent(this.myName)+'&mode='+this.mode
        +(this.token?'&token='+this.token:'');
      try{
        this.ws=new WebSocket(this.wsUrl+'?'+qs);
      }catch(e){
        this.lobbyError('创建 WebSocket 失败：'+e);
        return;
      }
      let opened=false;
      this.ws.onopen=()=>{opened=true;this.diag.ws='已连接';this.updateDiag();const q=this._outbox.splice(0);q.forEach(m=>this.sendRaw(m));};
      this.ws.onmessage=(ev)=>{
        let d;
        try{d=JSON.parse(ev.data);}catch(e){return;}
        this.diag.seqIn++;this.diag.lastIn=d.type+(d.seq?('#'+d.seq):'');this.updateDiag();
        this.dispatch(d);
      };
      this.ws.onclose=()=>{
        this.diag.ws='已断开';this.updateDiag();
        if(this._syncTimer){clearInterval(this._syncTimer);this._syncTimer=null;}
        this.onWsClosed(opened,retryCount);
      };
      this.ws.onerror=()=>{
        this.diag.err='无法连接服务器';this.updateDiag();
      };
    },

    /* 断线自动重连：未入座时重试 4 次（退避 2/4/8/16s）；已入座后断线重连 6 次（间隔 3s） */
    onWsClosed(opened,retryCount){
      if(this._fatal)return; // 服务器明确拒绝（房间不存在/已满等），不重试
      const maxRetry=this._joined?6:4;
      if(retryCount>=maxRetry){
        this.status('多次重连失败');
        this.lobbyError('连接服务器失败（已自动重试 '+maxRetry+' 次）。请检查网络后刷新页面；若刷新后仍失败，请让房主重新开房。');
        return;
      }
      const wait=this._joined?3000:(2000*(retryCount+1));
      const why=opened?'连接断开':'连接失败';
      this.status(why+'，'+Math.round(wait/1000)+' 秒后自动重试（'+(retryCount+1)+'/'+maxRetry+'）…');
      setTimeout(()=>{this.connect(retryCount+1);},wait);
    },

    lobbyError(msg){
      this.status('联机失败');
      const el=document.getElementById('lobbyList');
      if(el)el.innerHTML='<p style="color:#ffb3b3;font-size:.82rem;line-height:1.6">⚠ '+msg+'</p>';
      this.diag.err=msg;this.updateDiag();
      const cancel=document.getElementById('netCancel');if(cancel)cancel.textContent='返回大厅重新进入';
    },

    onHostOpen(){
      this.status('房间号：'+this.room+'（等待加入）');
      this.showLobby();
    },

    sendRaw(msg){
      if(this.ws&&this.ws.readyState===WebSocket.OPEN){
        try{this.ws.send(JSON.stringify(msg));this.diag.seqOut++;this.diag.lastOut=msg.type;this.updateDiag();return true;}
        catch(e){this.log('send err '+e);}
      }
      if(['ack','sync','rename'].includes(msg.type)){this._outbox.push(msg);}
      return false;
    },

    /* 客户端 -> 房主 */
    toHost(msg){return this.sendRaw(msg);},

    /* 房主 -> 所有客户端 */
    broadcast(msg){if(this.isHost)return this.sendRaw(msg);return false;},

    /* 兼容 PeerJS 时代的 lobby 刷新 */
    broadcastLobby(){
      if(this.isHost){
        this.broadcast({type:'lobby',count:this.names.filter(Boolean).length,players:this.names.slice(),max:4,room:this.room});
      }
      this.updateLobbyList();
    },

    isRemote(p){return this.isHost && p>=1 && p<=3 && this.humanSeats[p]===true;},
    remoteConn(p){return this.isRemote(p)?{send:(m)=>this.broadcast(Object.assign({},m))}:null;},

    dispatch(data){
      // 房主收到客户端动作
      if(this.isHost && data.type==='action'){
        const pid=data.fromPid!=null?data.fromPid:data.pid;
        if(pid!=null && window.netRemoteAction)window.netRemoteAction(pid,data.action||{});
        return;
      }
      if(this.isHost && data.type==='claimResponse'){
        const pid=data.fromPid!=null?data.fromPid:data.pid;
        if(pid!=null && window.netClaimMsg)window.netClaimMsg(pid,data.res||null);
        return;
      }
      if(this.isHost && data.type==='join'){
        const pid=data.pid;
        if(pid!=null && pid>=1 && pid<=3){this.names[pid]=(data.name||('玩家'+pid)).slice(0,8);this.humanSeats[pid]=true;this.broadcastLobby();}
        return;
      }
      if(this.isHost && data.type==='ack'){
        const pid=data.fromPid!=null?data.fromPid:data.pid;
        const name=(data.name||this.names[pid]||'玩家'+pid).slice(0,8);
        if(pid!=null && pid>=1 && pid<=3){this.names[pid]=name;this.humanSeats[pid]=true;this.log('client '+pid+' ACK');this.broadcastLobby();this.broadcastState();}
        return;
      }
      if(this.isHost && data.type==='rename'){
        const pid=data.fromPid!=null?data.fromPid:data.pid;
        if(pid!=null && pid>=1 && pid<=3){this.names[pid]=(data.name||this.names[pid]).slice(0,8);this.broadcastLobby();}
        return;
      }
      if(this.isHost && data.type==='sync'){
        const pid=data.fromPid!=null?data.fromPid:data.pid;
        try{this.broadcastState(pid);}catch(e){this.log('sync err '+e)}
        return;
      }

      if(this.isHost && data.type==='leave'){
        /* 客人掉线：保留座位 90 秒等待重连 */
        const pid=data.pid;
        if(pid>=1&&pid<=3){
          this._dc[pid]=true;this.humanSeats[pid]=false;
          if(typeof note==='function')note((this.names[pid]||('玩家'+pid))+' 掉线了，等待重连…');
          this.broadcast({type:'notify',text:(this.names[pid]||('玩家'+pid))+' 掉线了，AI 暂代其出牌…'});
          if(G&&G.h&&G.h.turn===pid&&typeof aiPlay==='function')setTimeout(()=>{if(G&&G.h&&!G.h.over&&G.h.turn===pid&&!this.isRemote(pid))aiPlay(pid);},0);
        }
        return;
      }
      if(this.isHost && data.type==='rejoin'){
        /* 客人重连恢复：重推完整状态，若是他的回合再补发 turn */
        const pid=data.pid;
        if(data.name)this.names[pid]=data.name;
        if(pid!=null && pid>=1 && pid<=3)this.humanSeats[pid]=true;
        this._dc[pid]=false;
        try{this.broadcastState();}catch(e){}
        if(G&&G.h&&G.h.turn===pid)this.sendTurn(pid);
        if(typeof note==='function')note((this.names[pid]||('玩家'+pid))+' 已重新连接');
        this.broadcast({type:'notify',text:(this.names[pid]||('玩家'+pid))+' 已重新连接'});
        return;
      }
      if(this.isHost && data.type==='welcome'){
        /* 房主入座/重连：记录 token；若牌局已在进行则重推状态给所有客人 */
        if(data.token)this.token=data.token;
        try{sessionStorage.setItem('jw-net-token-'+this.room,this.token);}catch(e){}
        this.names=(data.names||this.names).slice();
        this._joined=true;
        this.status('房间 '+this.room+' · 已连接');
        if(G&&G.h){
          this.status('已重新连接，同步牌局…');
          setTimeout(()=>{try{this.broadcastState();}catch(e){}},300);
        }
        return;
      }

      // 客户端收到房主/服务器消息
      if(!this.isHost && data.type==='welcome'){
        if(data.mode)this.mode=data.mode;
        this.pid=data.pid;this.names=(data.names||this.names).slice();
        if(data.token)this.token=data.token;
        try{sessionStorage.setItem('jw-net-token-'+this.room,this.token);}catch(e){}
        this._joined=true;
        if(this._syncTimer){clearInterval(this._syncTimer);this._syncTimer=null;}
        this.toHost({type:'ack',pid:this.pid,name:this.myName});
        if(!this._syncTimer)this._syncTimer=setInterval(()=>{if(!G||!G.h)this.toHost({type:'sync'});else{clearInterval(this._syncTimer);this._syncTimer=null;}},2000);
        try{this.toHost({type:'sync'});}catch(e){}
        if(G&&G.h){
          /* 重连恢复：立刻拉取最新牌局 */
          this.status('已重新连接，同步牌局…');
          if(!this._syncTimer)this._syncTimer=setInterval(()=>{if(!G||!G.h)this.toHost({type:'sync'});else{clearInterval(this._syncTimer);this._syncTimer=null;}},2000);
          try{this.toHost({type:'sync'});}catch(e){}
        }else{
          this.status('已连接房间 '+this.room+'，等待房主…');
        }
        this.updateLobbyList();
        return;
      }
      if(data.type==='lobby'){
        this.names=(data.players||this.names).slice();this.applyNames();
        this.updateLobbyList();return;
      }
      if(!this.isHost && data.type==='start'){
        this.names=(data.names||this.names).slice();
        this.applyNames();for(let i=0;i<4;i++)if(typeof NAMES!=='undefined')NAMES[i]=this.names[(this.pid+i)%4]||NAMES[i];
        const m=document.getElementById('modal');if(m)m.classList.remove('show');
        this.status('游戏开始，同步中…');
        if(!this._syncTimer)this._syncTimer=setInterval(()=>{if(!G||!G.h)this.toHost({type:'sync'});else{clearInterval(this._syncTimer);this._syncTimer=null;}},2000);
        try{this.toHost({type:'sync'});}catch(e){}
        return;
      }
      if(!this.isHost && data.type==='state'){
        if(data.toPid!=null&&Number(data.toPid)!==this.pid)return;
        if(!data.G||!data.G.h)return;
        try{
          this.applyNames();for(let i=0;i<4;i++)if(typeof NAMES!=='undefined')NAMES[i]=this.names[(this.pid+i)%4]||NAMES[i];
          G=this.rotateG(data.G,this.pid);
          if(this._syncTimer&&G&&G.h){clearInterval(this._syncTimer);this._syncTimer=null;}
          if(typeof renderAll==='function'){
            renderAll();
            if(G.h.turn!==0&&$('#actionBar').hidden)note('等待 '+NAMES[G.h.turn]+' 行牌');
            const m=document.getElementById('modal');
            if(m&&m.classList.contains('show')&&!G.h.over)m.classList.remove('show');
          }
          this.status(G.h.over?'本盘结束':NAMES[G.h.turn]+' 行牌（同步）');
        }catch(e){console.warn('client state err',e);}
        return;
      }
      if(!this.isHost && data.type==='turn'){
        if(data.pid===this.pid&&typeof humanOptions==='function')humanOptions();
        return;
      }
      if(!this.isHost && data.type==='claimOffer'){
        if(data.pid!==this.pid)return;
        if(typeof setActions==='function'){
          const wealth=data.wealth;
          const hasWealth=o=>o.act==='qiang'?false:(o.act==='吃'?data.tile===wealth||o.opt.includes(wealth):data.tile===wealth);
          const anyW=(data.options||[]).some(hasWealth);
          const opts=(data.options||[]).map(o=>({label:(hasWealth(o)?'⚠ ':'')+(o.act==='qiang'?'抢杠胡 '+data.tile+'！':o.act+(o.opt?' '+o.opt.join(''):'')),
            fn:()=>this.sendClaimResponse({act:o.act,opt:o.opt||null})}));
          setActions([...opts,{label:'过',fn:()=>this.sendClaimResponse(null)}]);
          if(typeof note==='function')note('可以 '+[...new Set((data.options||[]).map(o=>o.act==='qiang'?'抢杠胡':o.act))].join(' / ')+'（'+data.tile+'）'+(anyW?' ⚠ 涉及财神牌，请谨慎':''));
        }
        return;
      }
      if(!this.isHost && data.type==='modal'){
        if(typeof showModal==='function')showModal(data.html,data.final?[{label:'再来一局',fn:()=>location.reload()}]:[{label:'知道了',fn:()=>{}}]);
        return;
      }
      if(!this.isHost && data.type==='notify'){
        if(typeof note==='function')note(data.text||'');
        return;
      }
      if(data.type==='error'){
        this._fatal=true; // 服务器明确拒绝，停止自动重试
        this.lobbyError(data.text||'联机错误');return;
      }
      if(this.onMessage){this.onMessage(data);}
      else this.msgQueue.push(data);
    },

    rename(name){
      const n=(name||this.myName).slice(0,8);
      this.myName=n;
      if(this.isHost){this.names[0]=n;this.broadcastLobby();}
      else this.toHost({type:'rename',pid:this.pid,name:n});
    },

    sendTurn(p,initial=false){
      if(this.isHost) this.broadcast({type:'turn',pid:p,toPid:p,initial:!!initial});
    },

    sendAction(action){
      this.toHost({type:'action',pid:this.pid,action});
    },

    sendClaimOffer(p,tile,options){
      const wealth=G&&G.h?G.h.wealth:null;
      if(this.isHost) this.broadcast({type:'claimOffer',pid:p,toPid:p,tile,wealth,options:options.map(o=>({act:o.act,opt:o.opt||null}))});
    },

    sendClaimResponse(res){
      this.toHost({type:'claimResponse',pid:this.pid,res:res||null});
    },

    /* 房主按座位发送状态：本人手牌可见，另外三家只显示牌背 */
    broadcastState(targetPid=null){
      if(!this.active||!this.isHost)return;
      const base=JSON.parse(JSON.stringify(G||{}));
      if(!base||!base.h){this._statePending=true;setTimeout(()=>{if(this.isHost&&G&&G.h)this.broadcastState(targetPid);},250);return;}
      const wl=base.h.wall?base.h.wall.length:0;
      base.h.wall=new Array(wl).fill('…');
      const sendOne=pid=>{
        const state=JSON.parse(JSON.stringify(base));
        for(let q=0;q<4;q++){
          if(q!==pid)state.h.P[q].hand=new Array(state.h.P[q].hand.length).fill('白');
        }
        if(state.h.turn!==pid)state.h.drawn=null;
        this.broadcast({type:'state',G:state,toPid:pid,seq:++this.diag.seqOut});
      };
      if(targetPid!=null){
        const pid=Number(targetPid);
        if(pid>=1&&pid<=3)sendOne(pid);
      }else{
        for(let pid=1;pid<=3;pid++)if(this.isRemote(pid))sendOne(pid);
      }
      this.diag.lastOut='state';this.updateDiag();
    },

    rotateG(g,pid){
      const r=i=>(pid+i)%4;
      const h=g.h?Object.assign({},g.h,{
        dealer:(g.h.dealer-pid+4)%4,turn:(g.h.turn-pid+4)%4,
        P:[0,1,2,3].map(i=>g.h.P[r(i)]),
        discards:[0,1,2,3].map(i=>g.h.discards[r(i)])
      }):null;
      return Object.assign({},g,{h,scores:[0,1,2,3].map(i=>g.scores[r(i)]),specials:[0,1,2,3].map(i=>g.specials[r(i)])});
    },

    inviteUrl(){
      /* 干净链接：只带房间号；ws 与默认一致时不写入，换服务器才附加 */
      const extra=(this.wsUrl&&this.wsUrl!==this.defaultWsUrl())?'&ws='+encodeURIComponent(this.wsUrl):'';
      try{
        const u=new URL(location.href);u.search='';
        return u.toString()+'?v=10&mode='+this.mode+'&role=client&room='+this.room+extra;
      }catch(e){return 'game.html?v=10&mode='+this.mode+'&role=client&room='+this.room+extra;}
    },

    showLobby(){
      const m=document.getElementById('modal'); if(!m)return;
      const body=document.getElementById('modalBody');
      const btns=document.getElementById('modalBtns');
      const inv=this.inviteUrl();
      body.innerHTML='<h3>'+(this.isHost?'创建房间':'加入房间')+'</h3>'+
        '<p>房间号：<b style="font-size:1.4rem;letter-spacing:2px">'+this.room+'</b></p>'+
        (this.isHost?
          '<div style="margin:.5rem 0;padding:.6rem;background:#0b1d3d;border:2px dashed #f3d576;border-radius:8px">'+
          '<p style="margin:0 0 .3rem;font-size:.72rem;color:#9fd0ff">📱 把这条链接发给好友，点击即可自动加入：</p>'+
          '<a href="'+inv+'" style="display:block;padding:.4rem;background:#17305d;color:#ffefaa;font-size:.68rem;word-break:break-all;border:1px solid #f3d576;border-radius:4px;text-decoration:none;line-height:1.5">'+inv+'</a>'+
          '<div style="margin-top:.5rem;display:flex;gap:6px;justify-content:center;flex-wrap:wrap">'+
          '<button id="copyLink" style="padding:.35rem .6rem;font-size:.7rem">📋 复制链接</button>'+
          '<button id="shareLink" style="padding:.35rem .6rem;font-size:.7rem">📤 分享给好友</button>'+
          '<button id="copyRoom" style="padding:.35rem .6rem;font-size:.7rem">复制房间号</button></div></div>'
          :'<p style="margin:.5rem 0;display:flex;gap:8px;justify-content:center"><button id="copyRoom" style="padding:.35rem .7rem;font-size:.72rem">复制房间号</button></p>')+
        '<div id="lobbyList">等待连接…</div>'+
        '<details style="margin-top:14px;font-size:11px;color:#cfe8ff"><summary>连接详情</summary><div id="netDiag"></div></details>'+
        (this.isHost?'<p style="font-size:.65rem;color:#cfe8ff">把邀请链接发给好友，人满或 1 人以上即可开始</p>':
          '<p style="font-size:.65rem;color:#cfe8ff">等待房主开始游戏…</p>');
      btns.innerHTML=this.isHost?
        '<button id="netStart">开始游戏</button><button id="netCancel">返回首页</button>':
        '<button id="netCancel">返回首页</button>';
      m.classList.add('show');
      this.updateDiag();
      const cancel=document.getElementById('netCancel');
      if(cancel)cancel.onclick=()=>{m.classList.remove('show');location.href='index.html';};
      const copyRoom=document.getElementById('copyRoom');
      const copyLink=document.getElementById('copyLink');
      const shareLink=document.getElementById('shareLink');
      const doCopy=async(text,btn,okText)=>{
        try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(text);btn.textContent=okText;return;}}catch(e){}
        const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');btn.textContent=okText;}catch(err){btn.textContent='复制失败';}document.body.removeChild(ta);
      };
      if(copyRoom)copyRoom.onclick=()=>doCopy(this.room,copyRoom,'已复制房间号');
      if(copyLink)copyLink.onclick=()=>doCopy(inv,copyLink,'已复制链接');
      if(shareLink)shareLink.onclick=async()=>{
        if(navigator.share){
          try{await navigator.share({title:'鸡歪麻将厅',text:'来打麻将！房间号 '+this.room,url:inv});}catch(e){}
        }else{doCopy(inv,shareLink,'已复制链接，去粘贴给好友');}
      };
      if(this.isHost){
        const start=document.getElementById('netStart');
        start.onclick=()=>{
          const humans=this.names.filter(Boolean).length;
          if(humans<2)return;
          for(let i=0;i<4;i++)if(!this.names[i])this.names[i]=DEF_NAMES[i];
          this.broadcastLobby();
          this.started=true;
          m.classList.remove('show');
          this.broadcast({type:'start',names:this.names.slice()});
          if(window.startNetworkGame)window.startNetworkGame(this.mode);
        };
      }
      this.updateLobbyList();
    },

    applyNames(){
      if(typeof NAMES!=='undefined'){for(let i=0;i<4;i++)NAMES[i]=this.names[i]||NAMES[i];}
    },

    updateLobby(data){
      const players=(data?data.players:this.names).slice();
      const el=document.getElementById('lobbyList'); if(!el)return;
      const seats=players.map((n,i)=>{
        const isMe=(this.isHost&&i===0)||(!this.isHost&&i===this.pid);
        const isHostSeat=i===0;
        const empty=!n;
        const status=isHostSeat?'房主':(empty?'等待加入':'已就绪');
        const avatar=isHostSeat?'👑':(empty?'+':String.fromCharCode(0x2460+i));
        return '<div class="seat '+(isHostSeat?'host ':'')+(empty?'empty ':'')+(isMe?'me':'')+'" data-seat="'+i+'">'+
          '<div class="seat-avatar">'+avatar+'</div>'+
          '<div class="seat-name">'+(empty?'空位':escapeHTML(n))+'</div>'+
          '<div class="seat-status">'+status+(isMe?'（你）':'')+'</div>'+
          (isMe?'<button class="seat-edit">改名</button>':'')+
          '</div>';
      }).join('');
      el.innerHTML='<div class="seats">'+seats+'</div>';
      el.querySelectorAll('.seat-edit').forEach(btn=>{
        btn.onclick=()=>{
          const newName=prompt('输入你的昵称：',this.myName);
          if(newName!==null)this.rename(newName.trim()||this.myName);
        };
      });
      const btn=document.getElementById('netStart');
      if(btn)btn.disabled=(this.isHost && this.names.filter(Boolean).length<2);
    },

    updateLobbyList(){
      if(!this.isHost && this.pid<0){
        const el=document.getElementById('lobbyList');
        if(el)el.innerHTML='<p style="color:#9fd0ff;font-size:.9rem;line-height:1.7">🔄 正在连接房间 <b>'+this.room+'</b>…<br><small>如果长时间没反应，请检查服务器地址、房间号是否正确</small></p>';
        return;
      }
      this.updateLobby({players:this.names.slice()});
    }
  };

  const reconnectIfNeeded=()=>{if(Net.active&&(!Net.ws||Net.ws.readyState!==WebSocket.OPEN)&&!Net._fatal){Net.connect(0);}};
  window.addEventListener('online',reconnectIfNeeded);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)reconnectIfNeeded();});
  Net.init(new URLSearchParams(location.search));
  if(Net.active){
    if(document.readyState==='loading'){
      document.addEventListener('DOMContentLoaded',()=>Net.showLobby());
    }else Net.showLobby();
  }
  window.Net=Net;
})();
