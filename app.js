/* 江山麻将 · 游戏流程与AI（只能自摸 · 可抢杠 · 财神百搭） */
const DICE='⚀⚁⚂⚃⚄⚅',PRI={'杠':3,'碰':2,'吃':1};
let aiTimer=null,diceTimer=null;
const later=(fn,ms=800)=>{clearTimeout(aiTimer);aiTimer=setTimeout(fn,ms)};
/* 联机判定：net.js 先于 app.js 加载；test-sim 无 net.js，用 typeof 保护 */
const NETON=()=>typeof Net!=='undefined'&&Net.active;
const ISHOST=()=>NETON()&&Net.isHost;
const ISCLIENT=()=>NETON()&&!Net.isHost;
const REMOTE=(p)=>ISHOST()&&Net.isRemote(p);

function newGame(mode){G={mode,hand:0,scores:mode==='ju'?[30,30,30,30]:[0,0,0,0],specials:[0,0,0,0],over:false,h:null};startHand()}

/* ---------- 开盘 ---------- */
function startHand(){
  clearInterval(diceTimer);claimWin=null;robWinCtl=null;
  clearTimeout(aiTimer);clearActions();$('#modal').classList.remove('show');
  const pairs=[0,1,2,3].map(()=>[1+Math.floor(Math.random()*6),1+Math.floor(Math.random()*6)]);
  const sums=pairs.map(p=>p[0]+p[1]);
  let dealer=0;sums.forEach((s,i)=>{if(s>sums[dealer])dealer=i});
  const d2=[1+Math.floor(Math.random()*6),1+Math.floor(Math.random()*6)];
  G.h={wall:makeDeck(),dealer,turn:dealer,over:false,kongDraw:false,turnCount:0,turnActionTaken:false,
    discards:[[],[],[],[]],ind:null,wealth:null,drawn:null,warnWealth:false,
    P:[0,1,2,3].map(()=>({hand:[],melds:[],flowers:[],piao:0,hasDisc:false,draws:0}))};
  renderAll();note('四人掷骰定庄…');
  let n=0,dealt=false;const iv=diceTimer=setInterval(()=>{
    $('#diceBox').textContent=DICE[Math.floor(Math.random()*6)]+DICE[Math.floor(Math.random()*6)];sfx('dice');renderAll();
    if(++n>=5&&!dealt){dealt=true;clearInterval(iv);$('#diceBox').textContent=DICE[d2[0]-1]+DICE[d2[1]-1];
      dealTiles();
      let fi=0;while(fi<G.h.wall.length&&isFlower(G.h.wall[fi]))fi++;
      G.h.ind=G.h.wall[fi];G.h.wealth=nextTile(G.h.ind);
      renderAll();
      const dir=['自己','下家','对家','上家'][(d2[0]+d2[1]-1)%4];
      note(`${NAMES[dealer]} 掷出 ${sums[dealer]} 点坐庄；再掷 ${d2[0]+d2[1]}，自${dir}牌墙起摸 · 翻牌 ${G.h.ind} → 财神 ${G.h.wealth}（百搭）`);
      beginTurn(dealer,true);
    }
  },90);
}
/* 摸牌：头摸尾补，花牌垫出不入手、从牌墙尾补牌；剩 20 张流局 */
function takeTile(p,tail){
  while(true){
    if(G.h.wall.length<=20)return null;
    const t=tail?G.h.wall.pop():G.h.wall.shift();
    if(isFlower(t)){G.h.P[p].flowers.push(t);tail=true;continue} /* 垫花后改从尾补 */
    return t;
  }
}
function dealTiles(){
  const d=G.h.dealer;
  for(let r=0;r<3;r++)for(let k=0;k<4;k++){const p=(d+k)%4;for(let j=0;j<4;j++){const t=takeTile(p);if(t)G.h.P[p].hand.push(t)}}
  for(let p=0;p<4;p++){const n=p===d?2:1;for(let j=0;j<n;j++){const t=takeTile(p);if(t)G.h.P[p].hand.push(t)}}
}
/* ---------- 行牌 ---------- */
function beginTurn(p,initial=false){
  if(G.h.over)return;
  G.h.turn=p;G.h.turnCount++;G.h.turnActionTaken=false;renderAll();
  if(!initial){
    const t=takeTile(p);
    if(!t){endHandDraw();return}
    G.h.P[p].hand.push(t);G.h.P[p].draws++;G.h.drawn=t;sfx('draw');renderAll();
  }
  if(REMOTE(p)){Net.broadcastState();Net.sendTurn(p,initial);return}
  if(p===0)humanOptions(initial);else aiPlay(p,initial);
}
/* ---------- 人类回合 ---------- */
function nextActor(p){
  if(REMOTE(p)){Net.sendTurn(p);return}
  if(p===0)humanOptions();
  else if(REMOTE(p)){Net.broadcastState();Net.sendTurn(p)}
  else aiPlay(p);
}
function wealthWarn(t){return t===G.h.wealth?'⚠ 含财神 ':' '}
function humanOptions(initial=false){
  const P=G.h.P[0],need=4-P.melds.length,acts=[];
  if(ISCLIENT()){ /* 客户端：选项本地算好，动作发回房主执行 */
    if(canWinStruct(P.hand,G.h.wealth,need))acts.push({label:'胡！',fn:()=>Net.sendAction({act:'win'})});
    const c=counts(P.hand);
    Object.keys(c).filter(t=>c[t]===4).forEach(t=>acts.push({label:wealthWarn(t)+'暗杠 '+t,fn:()=>Net.sendAction({act:'angang',t})}));
    P.melds.forEach((m,i)=>{if(m.type==='peng'&&P.hand.includes(m.tiles[0]))acts.push({label:wealthWarn(m.tiles[0])+'补杠 '+m.tiles[0],fn:()=>Net.sendAction({act:'jiagang',mi:i,t:m.tiles[0]})})});
    setActions(acts);
    note(P.hand.length===3*need+2?'轮到你出牌'+(acts.length?'，或选择上方动作':''):'轮到你了');
    return;
  }
  if(canWinStruct(P.hand,G.h.wealth,need))acts.push({label:'胡！',fn:()=>winSelf(0)});
  const c=counts(P.hand);
  Object.keys(c).filter(t=>c[t]===4).forEach(t=>acts.push({label:wealthWarn(t)+'暗杠 '+t,fn:()=>doAnGang(0,t)}));
  P.melds.forEach((m,i)=>{if(m.type==='peng'&&P.hand.includes(m.tiles[0]))acts.push({label:wealthWarn(m.tiles[0])+'补杠 '+m.tiles[0],fn:()=>jiaGangFlow(0,i,m.tiles[0])})});
  setActions(acts);
  note(initial?'庄家开局，请选牌后确认打出':'轮到你了，请选牌后确认打出'+(acts.length?'，或选择吃碰杠胡动作':''));
}
function onHandClick(i){
  if(!G||!G.h||G.h.over||G.h.turnActionTaken)return;
  const P=G.h.P[0];
  if(ISCLIENT()){ /* 客户端：出牌请求发回房主 */
    if(G.h.turn!==0||P.hand.length!==3*(4-P.melds.length)+2)return;
    const t=P.hand[i];
    if(t===G.h.wealth&&!G.h.warnWealth){G.h.warnWealth=true;note('⚠ 财神是百搭！再点一次确认打出 —— 若已财吊（听全牌）打出即「飘财」，胡牌翻倍');setTimeout(()=>{if(G&&G.h)G.h.warnWealth=false},4000);return}
    clearActions();G.h.turnActionTaken=true;Net.sendAction({act:'discard',tile:t});
    return;
  }
  if(G.h.turn!==0||P.hand.length!==3*(4-P.melds.length)+2)return;
  const t=P.hand[i];
  if(t===G.h.wealth&&!G.h.warnWealth){G.h.warnWealth=true;note('⚠ 财神是百搭！再点一次确认打出 —— 若已财吊（听全牌）打出即「飘财」，胡牌翻倍');setTimeout(()=>{if(G)G.h.warnWealth=false},4000);return}
  doDiscard(0,i);
}
/* 鼠标/触屏出牌：按下先高亮，短点击才出牌，拖动超过阈值不误触 */
const handPointer={id:null,index:-1,x:0,y:0,moved:false,suppressClick:false};
const handEl=$('#hand');
handEl.addEventListener('pointerdown',e=>{
  const b=e.target.closest('[data-i]');if(!b)return;
  handPointer.id=e.pointerId;handPointer.index=+b.dataset.i;handPointer.x=e.clientX;handPointer.y=e.clientY;handPointer.moved=false;
  b.classList.add('selected');
  try{handEl.setPointerCapture(e.pointerId)}catch{}
});
handEl.addEventListener('pointermove',e=>{
  if(handPointer.id!==e.pointerId)return;
  if(Math.hypot(e.clientX-handPointer.x,e.clientY-handPointer.y)>8){
    handPointer.moved=true;
    const b=handEl.querySelector(`[data-i="${handPointer.index}"]`);if(b)b.classList.remove('selected');
  }
});
handEl.addEventListener('pointerup',e=>{
  if(handPointer.id!==e.pointerId)return;
  const idx=handPointer.index,moved=handPointer.moved;
  const b=handEl.querySelector(`[data-i="${idx}"]`);if(b)b.classList.remove('selected');
  handPointer.id=null;handPointer.index=-1;handPointer.moved=false;
  if(!moved){handPointer.suppressClick=true;selectHandTile(idx);setTimeout(()=>{handPointer.suppressClick=false},350)}
});
handEl.addEventListener('pointercancel',()=>{
  handEl.querySelector('.selected')?.classList.remove('selected');handPointer.id=null;handPointer.index=-1;handPointer.moved=false;
});
handEl.addEventListener('click',e=>{
  if(handPointer.suppressClick){e.preventDefault();return}
  const b=e.target.closest('[data-i]');if(!b)return;
  selectHandTile(+b.dataset.i);
});
if($('#discardBtn'))$('#discardBtn').onclick=()=>{
  if(!canChooseTile()||selectedHandIndex<0)return;
  onHandClick(selectedHandIndex);renderHandControls();
};
if($('#hintBtn'))$('#hintBtn').onclick=()=>{
  if(!G||!G.h||!G.h.wealth)return;
  const P=G.h.P[0],need=4-P.melds.length;
  const hand=P.hand.slice();
  if(hand.length===3*need+2){
    if(selectedHandIndex<0){$('#tileHint').textContent='先选一张牌，查看打出后的听牌';return;}
    hand.splice(selectedHandIndex,1);
  }
  const waits=waitTiles(hand,G.h.wealth,need);
  $('#tileHint').textContent=waits.length===34?'财吊！听所有牌':waits.length?'听牌：'+waits.join('、'):'尚未听牌，继续整理手牌';
};
/* ---------- 出牌 ---------- */
function doDiscard(p,idx){
  if(!G||!G.h||G.h.over||G.h.turnActionTaken)return;
  const P=G.h.P[p];if(!P||idx<0||idx>=P.hand.length)return;
  G.h.turnActionTaken=true;const tile=P.hand.splice(idx,1)[0];
  P.hasDisc=true;G.h.kongDraw=false;
  if(tile===G.h.wealth){
    const w=waitTiles(P.hand,G.h.wealth,4-P.melds.length);
    if(w.length===ORDER.length){P.piao++;note('🀄 飘财！'+NAMES[p]+' 财吊状态打出财神，若胡牌 ×'+Math.pow(2,P.piao))}
    else if(p===0)note('财神已打出（未财吊，无翻倍）');
  }
  G.h.discards[p].push(tile);sfx('discard');renderAll();
  afterDiscard(p,tile);
}
/* ---------- 别人出牌后的吃碰杠窗口（本地人 + 远端真人 + AI 统一裁决） ---------- */
function afterDiscard(p,tile){
  if(G.h.over)return;
  const claims=[];
  for(let q=0;q<4;q++){if(q===p)continue;const c=counts(G.h.P[q].hand)[tile]||0;
    if(c>=3)claims.push({q,act:'杠'});
    else if(c>=2)claims.push({q,act:'碰'});}
  const q=(p+1)%4;
  if(suitOf(tile))chiOptions(tile,G.h.P[q].hand).forEach(o=>claims.push({q,act:'吃',opt:o}));
  const ais=claims.filter(x=>x.q!==0&&!REMOTE(x.q));
  const aiBest=Math.max(0,...ais.map(a=>PRI[a.act]));
  const mine=claims.filter(x=>(x.q===0||REMOTE(x.q))&&PRI[x.act]>=aiBest);
  if(!mine.length){resolveAI(p,tile,ais);return}
  openClaimWindow(p,tile,mine,ais);
}
let claimWin=null,robWinCtl=null;
function claimHasWealth(tile,cl){if(tile===G.h.wealth)return true;if(cl.act==='吃')return cl.opt.includes(G.h.wealth);return false}
function openClaimWindow(p,tile,mine,ais){
  const resp={},done={};let timer=null;
  const finish=()=>{
    if(!claimWin)return;claimWin=null;clearTimeout(timer);clearActions();
    const cand=[];
    mine.forEach(m=>{const r=resp[m.q];if(r)cand.push(r)});
    ais.forEach(a=>cand.push(a));
    cand.sort((a,b)=>PRI[b.act]-PRI[a.act]);
    if(cand.length){doClaim(p,tile,cand[0]);return}
    later(()=>beginTurn((p+1)%4),650);
  };
  const submit=(q,r)=>{ /* r=null 表示过 */
    if(!claimWin||done[q]||!mine.some(m=>m.q===q))return;
    if(r){
      const legal=mine.find(m=>m.q===q&&m.act===r.act&&JSON.stringify(m.opt||null)===JSON.stringify(r.opt||null));
      if(!legal)return;
      resp[q]=legal;
    }
    done[q]=true;
    const pend=mine.filter(m=>!done[m.q]);
    if(!pend.length)finish();
    else if(q===0)note('已选择，等待其他玩家…');
  };
  const seats=[...new Set(mine.map(m=>m.q))];
  claimWin={submit};
  if(seats.some(q=>REMOTE(q)))timer=setTimeout(finish,12000); /* 有远端玩家才限时，单机不计时 */
  seats.forEach(q=>{
    if(q===0){
      const my=mine.filter(x=>x.q===0);
      const anyW=my.some(cl=>claimHasWealth(tile,cl));
      setActions([...my.map(cl=>({label:(claimHasWealth(tile,cl)?'⚠ ':'')+cl.act+(cl.opt?' '+cl.opt.join(''):''),fn:()=>submit(0,cl)})),{label:'过',fn:()=>submit(0,null)}]);
      note('可以 '+[...new Set(my.map(m=>m.act))].join(' / ')+'（'+tile+'）'+(anyW?' ⚠ 涉及财神牌，请谨慎':''));
    }else{
      Net.sendClaimOffer(q,tile,mine.filter(x=>x.q===q));
    }
  });
  if(!seats.includes(0))note(NAMES[p]+' 打出 '+tile+'，等待玩家选择…');
}
/* net.js 收到远端玩家的吃碰杠/抢杠应答后回调到这里（globalThis 兼容 Node 压测） */
globalThis.netClaimMsg=function(pid,res){
  if(claimWin){
    const cl=res?{q:pid,act:res.act,opt:res.opt||null}:null;
    if(cl&&cl.act==='qiang')return; /* 抢杠走另一个窗口 */
    claimWin.submit(pid,cl);return;
  }
  if(robWinCtl)robWinCtl.resp(pid,res&&res.act==='qiang'?'qiang':null);
};
function resolveAI(p,tile,ais){
  clearActions();
  ais.sort((a,b)=>PRI[b.act]-PRI[a.act]);
  for(const cl of ais){
    if(cl.act==='杠'){later(()=>doClaim(p,tile,cl));return}
    if(cl.act==='碰'&&Math.random()<0.88){later(()=>doClaim(p,tile,cl));return}
    if(cl.act==='吃'&&Math.random()<0.5){later(()=>doClaim(p,tile,cl));return}
  }
  later(()=>beginTurn((p+1)%4),650);
}
function doClaim(p,tile,cl){
  const q=cl.q,P=G.h.P[q];
  G.h.discards[p].pop();
  if(cl.act==='杠'){
    for(let k=0;k<3;k++)P.hand.splice(P.hand.indexOf(tile),1);
    P.melds.push({type:'gang',tiles:[tile,tile,tile,tile],from:p});
    sfx('gang');note(NAMES[q]+' 明杠 '+tile);
    G.h.kongDraw=true;G.h.turn=q;G.h.turnActionTaken=false;renderAll();
    const t=takeTile(q,true);
    if(!t){endHandDraw();return}
    P.hand.push(t);G.h.drawn=t;renderAll();
    if(REMOTE(q)){Net.broadcastState();Net.sendTurn(q);return}
    nextActor(q);
  }else if(cl.act==='碰'){
    for(let k=0;k<2;k++)P.hand.splice(P.hand.indexOf(tile),1);
    P.melds.push({type:'peng',tiles:[tile,tile,tile],from:p});
    sfx('peng');note(NAMES[q]+' 碰 '+tile);
    G.h.turn=q;G.h.turnActionTaken=false;renderAll();
    if(q!==0&&!REMOTE(q))later(()=>aiDiscard(q),700);
    else if(REMOTE(q)){Net.broadcastState();Net.sendTurn(q)}
  }else{
    cl.opt.forEach(x=>P.hand.splice(P.hand.indexOf(x),1));
    const seq=[...cl.opt,tile].sort((a,b)=>valOf(a)-valOf(b));
    P.melds.push({type:'chi',tiles:seq,from:p});
    note(NAMES[q]+' 吃 '+seq.join(' '));
    G.h.turn=q;G.h.turnActionTaken=false;renderAll();
    if(q!==0&&!REMOTE(q))later(()=>aiDiscard(q),700);
    else if(REMOTE(q)){Net.broadcastState();Net.sendTurn(q)}
  }
}
/* ---------- 杠 ---------- */
function doAnGang(p,t){
  const P=G.h.P[p];
  for(let k=0;k<4;k++)P.hand.splice(P.hand.indexOf(t),1);
  P.melds.push({type:'gang',tiles:[t,t,t,t]});
  sfx('gang');note(NAMES[p]+' 暗杠 '+t);
  G.h.kongDraw=true;G.h.turn=p;G.h.turnActionTaken=false;renderAll();
  const d=takeTile(p,true);
  if(!d){endHandDraw();return}
  P.hand.push(d);G.h.drawn=d;renderAll();
  if(p===0)humanOptions();
  else if(REMOTE(p)){Net.broadcastState();Net.sendTurn(p)}
  else aiPlay(p);
}
function jiaGangFlow(p,mi,t){
  const robbers=[];
  for(let q=0;q<4;q++){if(q===p)continue;
    if(canWinStruct(G.h.P[q].hand.concat(t),G.h.wealth,4-G.h.P[q].melds.length))robbers.push(q)}
  const proceed=()=>{
    const P=G.h.P[p];
    P.hand.splice(P.hand.indexOf(t),1);
    const m=P.melds[mi];m.type='gang';m.tiles=[t,t,t,t];
    sfx('gang');note(NAMES[p]+' 补杠 '+t);
    G.h.kongDraw=true;G.h.turn=p;G.h.turnActionTaken=false;renderAll();
    const d=takeTile(p,true);
    if(!d){endHandDraw();return}
    P.hand.push(d);G.h.drawn=d;renderAll();
    if(p===0)humanOptions();
  else if(REMOTE(p)){Net.broadcastState();Net.sendTurn(p)}
  else aiPlay(p);
  };
  if(!robbers.length){proceed();return}
  const aiR=robbers.find(q=>q!==0&&!REMOTE(q));
  const humanR=robbers.filter(q=>q===0||REMOTE(q));
  if(!humanR.length){later(()=>robWin(aiR,p,t),700);return}
  /* 抢杠窗口：本地按钮 + 远端 offer，全部应答后统一裁决 */
  let winner=null;const rdone={};let timer=null;
  const finish=()=>{
    if(!robWinCtl)return;robWinCtl=null;clearTimeout(timer);clearActions();
    if(winner!==null)robWin(winner,p,t);
    else if(aiR!==undefined)later(()=>robWin(aiR,p,t),600);
    else proceed();
  };
  const submit=(q,r)=>{if(!robWinCtl||rdone[q]||!humanR.includes(q))return;rdone[q]=true;if(r==='qiang')winner=q;
    if(humanR.every(x=>rdone[x]))finish();};
  if(humanR.some(q=>REMOTE(q)))timer=setTimeout(finish,12000);
  robWinCtl={resp:submit};
  humanR.forEach(q=>{
    if(q===0){
      setActions([{label:'抢杠胡 '+t+'！',fn:()=>submit(0,'qiang')},
        {label:'过',fn:()=>submit(0,null)}]);
      note('⚠ '+NAMES[p]+' 补杠 '+t+' —— 你可以抢杠胡！');
    }else Net.sendClaimOffer(q,t,[{act:'qiang'}]);
  });
  if(!humanR.includes(0))note(NAMES[p]+' 补杠 '+t+'，等待抢杠应答…');
}
function robWin(q,declarer,tile){
  const i=G.h.P[declarer].hand.indexOf(tile);
  if(i>=0)G.h.P[declarer].hand.splice(i,1);
  G.h.P[q].hand.push(tile);
  settleWin(q,tile,declarer);
}
/* ---------- AI ---------- */
function aiPlay(p,initial=false){
  const P=G.h.P[p],need=4-P.melds.length;
  if(canWinStruct(P.hand,G.h.wealth,need)){later(()=>winSelf(p),950);return}
  const c=counts(P.hand);
  const ag=Object.keys(c).find(t=>c[t]===4);
  const km=P.melds.map((m,i)=>m.type==='peng'&&P.hand.includes(m.tiles[0])?{i,t:m.tiles[0]}:null).filter(Boolean);
  later(()=>{
    if(ag){doAnGang(p,ag);return}
    if(km.length){jiaGangFlow(p,km[0].i,km[0].t);return}
    aiDiscard(p);
  },850);
}
function aiDiscard(p){
  const P=G.h.P[p],hand=P.hand;
  if(!hand.length)return;
  const c=counts(hand);let best=0,bestV=1e9;
  for(let i=0;i<hand.length;i++){
    const t=hand[i];
    if(t===G.h.wealth)continue;
    let v=Math.random()*.4;
    const n=numOf(t),s=suitOf(t);
    v+=(c[t]-1)*3;
    if(s){for(const d of[-2,-1,1,2]){const u=n+d;if(u>0&&u<10&&c[u+s])v+=(d%2?1.6:0.6)}}
    else v-=.4;
    if(v<bestV){bestV=v;best=i}
  }
  doDiscard(p,best);
}
/* ---------- 胡牌结算 ---------- */
function winSelf(p){settleWin(p,G.h.drawn||G.h.P[p].hand[G.h.P[p].hand.length-1],null)}
function settleWin(p,winTile,robbed){
  G.h.over=true;clearTimeout(aiTimer);clearActions();
  const P=G.h.P[p];
  const noMelds=G.h.P.every(x=>!x.melds.length);
  const nobodyDisc=G.h.P.every(x=>!x.hasDisc);
  const tianHu=p===G.h.dealer&&nobodyDisc&&noMelds&&P.draws===0;
  const diHu=p!==G.h.dealer&&P.draws===1&&noMelds;
  const res=scoreWin({concealed:P.hand.slice(),melds:P.melds.map(m=>m.tiles),meldFrom:P.melds.map(m=>m.from),
    winTile,wealth:G.h.wealth,flowers:P.flowers.length,afterKong:G.h.kongDraw,
    tianHu,diHu,piaoCount:P.piao});
  /* 即时支付分：8盘模式特殊分即时计入；局麻模式特殊分递延至总结算 */
  const imm=G.mode==='ju'?res.total-res.special:res.total;
  const rows=[];
  if(robbed!==null){G.scores[robbed]-=imm*3;G.scores[p]+=imm*3;
    rows.push(`<tr><td>${escapeHTML(NAMES[robbed])} 被抢杠</td><td>承包三家 −${imm*3}</td></tr>`)}
  else{for(let q=0;q<4;q++)if(q!==p){G.scores[q]-=imm;G.scores[p]+=imm}
    rows.push(`<tr><td>自摸胡</td><td>其余三家各付 ${imm}</td></tr>`)}
  if(G.mode==='ju'&&res.special){G.specials[p]+=res.special;
    rows.push(`<tr><td>特殊分（结算时计入）</td><td>+${res.special} ★</td></tr>`)}
  sfx('win');renderAll();
  const tilesHtml=P.hand.map(t=>face(t,'mtile')).join('')+P.melds.map(m=>`<span class="meld">${m.tiles.map(t=>face(t,'mtile s')).join('')}</span>`).join('');
  const det=res.detail.map(d=>`<tr><td>${d[0]}</td><td>${d[1]?'+'+d[1]:''}</td></tr>`).join('');
  showModal(`<h3>${escapeHTML(NAMES[p])+(robbed!==null?' 抢杠胡！':' 自摸胡！')}</h3>
    <div class="wintiles">${tilesHtml}</div>
    <table class="mtable"><tr><th>项目</th><th>分值</th></tr>${det}${rows}
    <tr class="sum"><td>合计</td><td>${imm} 分${G.mode==='ju'&&res.special?'（+'+res.special+'★ 结算时计）':''}</td></tr></table>`,
    [endBtn()]);
}
function endHandDraw(){
  G.h.over=true;clearTimeout(aiTimer);clearActions();renderAll();
  showModal('<h3>流局</h3><p>牌墙只剩 20 张，无人胡牌，本盘不计分。</p>',[endBtn()]);
}
function endBtn(){
  const juEnd=G.mode==='ju'&&G.scores.some(s=>s<=0);
  const p8End=G.mode==='p8'&&G.hand>=7;
  if(juEnd||p8End)return{label:'查看总结算',fn:finalSettle};
  return{label:'下一盘 ▶',fn:()=>{G.hand++;startHand()}};
}
function finalSettle(){
  let finals;
  if(G.mode==='ju'){
    finals=G.scores.map((s,q)=>s+G.specials[q]).map(s=>Math.max(0,s)); /* 负分不进入计算结果 */
  }else finals=G.scores.slice();
  const rank=[0,1,2,3].sort((a,b)=>finals[b]-finals[a]);
  const rows=rank.map((q,i)=>`<tr class="${i===0?'champ':''}"><td>第${i+1}名</td><td>${escapeHTML(NAMES[q])}</td><td>${finals[q]} 分</td></tr>`).join('');
  showModal(`<h3>🏁 牌局总结算</h3><p>${G.mode==='ju'?'局麻模式（30分起）：特殊分已计入，负分按 0 计':'8盘模式'}，最终排名：</p>
    <table class="mtable">${rows}</table>`,[{label:'再来一局',fn:()=>location.reload()}]);
}
/* ---------- 启动 ---------- */
const MODE=new URLSearchParams(location.search).get('mode')==='ju'?'ju':'p8';
/* 房主收到远端玩家的回合动作（出牌/胡/杠），在权威端执行 */
globalThis.netRemoteAction=function(p,a){
  if(!G||!G.h||G.h.over||G.h.turn!==p)return;
  const P=G.h.P[p];
  if(a.act==='discard'){if(G.h.turnActionTaken)return;const need=4-P.melds.length;if(P.hand.length!==3*need+2)return;const i=P.hand.indexOf(a.tile);if(i>=0)doDiscard(p,i);return}
  if(a.act==='win'){if(canWinStruct(P.hand,G.h.wealth,4-P.melds.length))winSelf(p);return}
  if(a.act==='angang'){if(counts(P.hand)[a.t]===4)doAnGang(p,a.t);return}
  if(a.act==='jiagang'){const m=P.melds[a.mi];if(m&&m.type==='peng'&&m.tiles[0]===a.t&&P.hand.includes(a.t))jiaGangFlow(p,a.mi,a.t);return}
};
if(!NETON())newGame(MODE);
else if(Net.isHost){
  /* 房主：等待大厅点「开始游戏」后由 startNetworkGame 启动，并广播渲染/提示 */
  window.startNetworkGame=function(mode){
    for(let i=0;i<4;i++)NAMES[i]=Net.names[i]||NAMES[i];
    /* 状态广播节流：renderAll 频繁调用，避免每帧都广播 */
    let bcPending=false,bcTimer=null;
    const throttledBC=()=>{
      if(!Net.active||!Net.isHost)return;
      if(bcPending)return;
      bcPending=true;
      bcTimer=setTimeout(()=>{bcPending=false;try{Net.broadcastState();}catch(e){console.warn('bcState',e);}},100);
    };
    const _ra=renderAll;renderAll=function(){_ra();throttledBC();};
    const _sm=showModal;showModal=function(html,btns){_sm(html,btns);Net.broadcast({type:'modal',html,final:!!(btns&&btns.length&&btns[0].label==='再来一局')})};
    const _note=note;note=function(x){_note(x);Net.broadcast({type:'notify',text:x})};
    newGame(mode);
    /* 立即广播一次让客户端能马上看到开局状态 */
    setTimeout(()=>{try{Net.broadcastState();}catch(e){}},50);
  };
  $('#newRound').style.display='none';
}else{
  /* 客户端：游戏状态完全由房主广播。同步请求由 net.js 在连接 open 后管理（更可靠） */
  $('#newRound').style.display='none';
}
if($('#newRound').style.display!=='none')$('#newRound').onclick=()=>{clearTimeout(aiTimer);startHand()};
$('#musicBtn').onclick=()=>{musicOn=!musicOn;if(musicOn){if(localSource==='upload'){if(localAudio)localAudio.play().catch(()=>{});else $('#uploadMusic').click()}else startPlaylistAudio()}else stopMusic()};
document.addEventListener('pointerdown',()=>{if(musicOn&&!localAudio)startPlaylistAudio()},{once:true});
/* 允许用户上传本地 MP3 作为背景乐 */
if(!$('#localMp3')){
  const f=document.createElement('input');f.type='file';f.id='localMp3';f.accept='audio/*';f.style.display='none';
  f.onchange=e=>{const file=e.target.files[0];if(!file)return;musicOn=true;startLocalAudio(URL.createObjectURL(file),'upload');$('#musicBtn').textContent='♫ 本地音乐：开'};
  document.body.appendChild(f);
}
$('#uploadMusic')&&($('#uploadMusic').onclick=()=>$('#localMp3').click());
