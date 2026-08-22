/* 无头模拟压测：DOM 桩 + 立即定时器，跑完整牌局验证流程与不变量 */
const fs=require('fs'),path=require('path');
const DIR=path.join(__dirname);
/* ---- DOM 桩 ---- */
function mkEl(){const e={innerHTML:'',_t:'',hidden:false,onclick:null,style:{},dataset:{},_ch:{},
  classList:{_s:new Set(),toggle(c,f){f===undefined?(this._s.has(c)?this._s.delete(c):this._s.add(c)):(f?this._s.add(c):this._s.delete(c))},add(c){this._s.add(c)},remove(c){this._s.delete(c)},contains(c){return this._s.has(c)}},
  addEventListener(){},};
  Object.defineProperty(e,'textContent',{get(){return this._t},set(v){this._t=String(v)}});
  e.querySelector=function(s){return this._ch[s]??=mkEl()};
  return e}
const reg={};
global.document={querySelector(s){return reg[s]??=mkEl()},querySelectorAll(){return[]},addEventListener(){},body:{}};
global.location={search:'?mode=8'};
/* ---- 手动泵定时器：带取消语义，模拟真实 setTimeout/clearTimeout ---- */
const timers=[],tmap=new Map();let tid=0;
global.setTimeout=(fn)=>{const id=++tid;tmap.set(id,{fn,dead:false});timers.push(id);return id};
global.clearTimeout=(id)=>{const r=tmap.get(id);if(r)r.dead=true};
global.setInterval=(fn)=>{const id=++tid;tmap.set(id,{fn:()=>{for(let i=0;i<5;i++)fn()},dead:false});timers.push(id);return id};
global.clearInterval=(id)=>{const r=tmap.get(id);if(r)r.dead=true};
function pump(){let n=0;while(timers.length){const id=timers.shift();const r=tmap.get(id);if(!r||r.dead)continue;tmap.delete(id);r.fn();if(++n>60000)throw new Error('timer storm')}}

const code=['engine.js','ui.js','app.js'].map(f=>fs.readFileSync(path.join(DIR,f),'utf8')).join('\n;\n');
const harness=`
;(function(){
  let lastActions=[],fresh=false;
  const _origSet=setActions,_origClear=clearActions;
  setActions=function(list){lastActions=list||[];fresh=lastActions.length>0;_origSet(list)};
  clearActions=function(){lastActions=[];fresh=false;_origClear()};
  let rngState=42;const rnd=()=>{rngState=(rngState*1103515245+12345)%2147483648;return rngState/2147483648};
  function humanPick(){
    const P=G.h.P[0],need=4-P.melds.length;
    /* 该我出牌：直接出一张（跳过财神，除非只剩财神；财神需二次确认） */
    if(G.h.turn===0&&P.hand.length===3*need+2){
      let i=0;while(i<P.hand.length-1&&P.hand[i]===G.h.wealth)i++;
      onHandClick(i);if(P.hand.length===3*need+2)onHandClick(i);/* 财神二次确认 */
      fresh=false;return true}
    /* 仅响应含「过」的声明窗口（吃/碰/杠/抢杠），杜绝陈旧按钮 */
    if(fresh&&lastActions.length&&lastActions.some(a=>a.label==='过')){
      const pass=lastActions.find(a=>a.label==='过');
      const claim=lastActions.filter(a=>a.label!=='过'&&rnd()<0.3);
      if(claim.length){claim[0].fn()}else{pass.fn()}
      fresh=false;return true}
    return false}
  function checkInvariant(tag){
    let total=G.h.wall.length;
    G.h.P.forEach(P=>{total+=P.hand.length+P.flowers.length;P.melds.forEach(m=>total+=m.tiles.length)});
    G.h.discards.forEach(d=>total+=d.length);
    if(total!==144)throw new Error(tag+' 牌数守恒破坏: '+total);
    const sum=G.scores.reduce((a,b)=>a+b,0);
    const want=G.mode==='ju'?120:0;
    if(sum!==want)throw new Error(tag+' 分数守恒破坏: '+sum+' != '+want)}
  /* app.js 加载时 newGame 已自动开盘（骰子 interval 已入队），先 pump 完成它，避免双重发牌 */
  pump();
  function simHand(h,skipStart){
    if(!skipStart)startHand();
    pump();
    let guard=0,still=0;
    while(!G.h.over){if(guard++>30000)throw new Error('第'+h+'盘 死循环');
      const did=humanPick();const q0=timers.length;pump();
      if(!did&&q0===0){if(++still>50)throw new Error('第'+h+'盘 卡死: turn='+G.h.turn+' hands='+JSON.stringify(G.h.P.map(P=>P.hand.length))+' melds='+JSON.stringify(G.h.P.map(P=>P.melds.length))+' wall='+G.h.wall.length+' acts='+JSON.stringify(lastActions.map(a=>a.label)))}
      else still=0}
    checkInvariant('第'+h+'盘结束');
    return G.h.over}
  /* ---- 跑 8盘模式（第一盘已由 newGame 自动开始） ---- */
  simHand(0,true);
  for(let h=1;h<8;h++){simHand(h);G.hand++}
  checkInvariant('8盘结束');
  /* ---- 跑 局麻模式若干盘（newGame('ju') 自动开始第一盘） ---- */
  newGame('ju');pump();
  let juHands=1;simHand(0,true);
  while(juHands<12&&!G.scores.some(s=>s<=0)){simHand(juHands);juHands++;G.hand++}
  console.log('SIM_OK p8_hands=8 ju_hands='+juHands+' ju_scores='+JSON.stringify(G.scores)+' specials='+JSON.stringify(G.specials));
})();`;
try{eval(code+harness)}catch(e){console.error('SIM_FAIL:',e.message);console.error(e.stack.split('\n').slice(0,6).join('\n'));process.exit(1)}
