import './engine.js';
const R=globalThis.MahjongRules;
const copy=x=>JSON.parse(JSON.stringify(x));
const seats=[0,1,2,3];
export const AI_DELAY=750,CLAIM_MS=12000;
const fail=text=>{throw new Error(text);};
function phase(g,kind,extra={},now=Date.now()){
  g.decision=(g.decision||0)+1;
  g.phase={kind,id:g.id+':'+g.decision,since:now,...extra};
}
function event(g,text){g.events.push({n:g.revision+1,text});g.events=g.events.slice(-12);}
function take(g,p,tail=false){
  while(g.h.wall.length>20){const t=tail?g.h.wall.pop():g.h.wall.shift();if(R.isFlower(t)){g.h.P[p].flowers.push(t);tail=true;}else return t;}
  return null;
}
export function createGame(mode,humans,now=Date.now()){
  const g={id:crypto.randomUUID(),revision:1,decision:0,mode:mode==='ju'?'ju':'p8',hand:0,scores:mode==='ju'?[30,30,30,30]:[0,0,0,0],specials:[0,0,0,0],humans:[...humans],events:[],h:null,result:null};
  startHand(g,now);return g;
}
function startHand(g,now){
  const pairs=seats.map(()=>[1+Math.floor(Math.random()*6),1+Math.floor(Math.random()*6)]);
  const rolls=pairs.map(pair=>pair[0]+pair[1]);
  const dealer=rolls.indexOf(Math.max(...rolls));
  g.h={wall:R.makeDeck(),dealer,turn:dealer,dice:{pairs,values:pairs[dealer],rolling:false},over:false,kongDraw:false,turnCount:0,turnActionTaken:false,discards:[[],[],[],[]],ind:null,wealth:null,drawn:null,warnWealth:false,
    P:seats.map(()=>({hand:[],melds:[],flowers:[],piao:0,hasDisc:false,draws:0}))};
  g.result=null;
  for(let r=0;r<3;r++)for(let k=0;k<4;k++)for(let j=0;j<4;j++)g.h.P[(dealer+k)%4].hand.push(take(g,(dealer+k)%4));
  for(const p of seats)for(let j=0;j<(p===dealer?2:1);j++)g.h.P[p].hand.push(take(g,p));
  g.h.ind=g.h.wall.find(t=>!R.isFlower(t));g.h.wealth=R.nextTile(g.h.ind);
  event(g,'第 '+(g.hand+1)+' 盘发牌完成');turn(g,dealer,false,false,now);
}
function turn(g,p,draw=true,tail=false,now=Date.now()){
  g.h.turn=p;g.h.turnCount++;g.h.turnActionTaken=false;g.h.kongDraw=tail;
  if(draw){const t=take(g,p,tail);if(!t){endDraw(g,now);return;}g.h.P[p].hand.push(t);g.h.P[p].draws++;g.h.drawn=t;}
  else g.h.drawn=null;
  phase(g,'turn',{actor:p},now);
}
export function turnOptions(g,p){
  if(g.phase.kind!=='turn'||g.phase.actor!==p)return [];
  const P=g.h.P[p],c=R.counts(P.hand),out=[];
  if(R.canWinStruct(P.hand,g.h.wealth,4-P.melds.length))out.push({act:'win'});
  for(const t of Object.keys(c))if(c[t]===4)out.push({act:'angang',t});
  P.melds.forEach((m,mi)=>{if(m.type==='peng'&&P.hand.includes(m.tiles[0]))out.push({act:'jiagang',t:m.tiles[0],mi});});
  return out;
}
function remove(P,t,n=1){for(let j=0;j<n;j++){const i=P.hand.indexOf(t);if(i<0)fail('手牌已变化，请重新同步');P.hand.splice(i,1);}}
function claims(g,p,t,now){
  const offers={};
  for(const q of seats){if(q===p)continue;const n=R.counts(g.h.P[q].hand)[t]||0,out=[];
    if(n>=3)out.push({act:'杠'});if(n>=2)out.push({act:'碰'});
    if(q===(p+1)%4)for(const opt of R.chiOptions(t,g.h.P[q].hand))out.push({act:'吃',opt});
    if(out.length)offers[q]=out;
  }
  if(!Object.keys(offers).length){turn(g,(p+1)%4,true,false,now);return;}
  phase(g,'claim',{from:p,tile:t,offers,replies:{},deadline:now+CLAIM_MS},now);
}
function resolveClaim(g,now){
  const ph=g.phase,priority={'杠':3,'碰':2,'吃':1};
  const candidates=Object.entries(ph.replies).filter(([,r])=>r).map(([q,r])=>({q:+q,...r}));
  candidates.sort((a,b)=>priority[b.act]-priority[a.act]||((a.q-ph.from+4)%4)-((b.q-ph.from+4)%4));
  if(!candidates.length){turn(g,(ph.from+1)%4,true,false,now);return;}
  const cl=candidates[0],P=g.h.P[cl.q],t=ph.tile;
  g.h.discards[ph.from].pop();
  if(cl.act==='吃'){for(const u of cl.opt)remove(P,u);P.melds.push({type:'chi',tiles:[...cl.opt,t].sort((a,b)=>R.valOf(a)-R.valOf(b)),from:ph.from});}
  else{remove(P,t,cl.act==='杠'?3:2);P.melds.push({type:cl.act==='杠'?'gang':'peng',tiles:Array(cl.act==='杠'?4:3).fill(t),from:ph.from});}
  event(g,'座位 '+cl.q+' '+cl.act+' '+t);
  turn(g,cl.q,cl.act==='杠',cl.act==='杠',now);
}
function completeKong(g,p,mi,t,now){
  const P=g.h.P[p];remove(P,t);P.melds[mi].type='gang';P.melds[mi].tiles.push(t);
  event(g,'座位 '+p+' 补杠 '+t);turn(g,p,true,true,now);
}
function resolveRob(g,now){
  const ph=g.phase,winners=Object.entries(ph.replies).filter(([,r])=>r).map(([p])=>+p).sort((a,b)=>(a-ph.from+4)%4-(b-ph.from+4)%4);
  if(!winners.length){completeKong(g,ph.from,ph.mi,ph.tile,now);return;}
  const p=winners[0];remove(g.h.P[ph.from],ph.tile);g.h.P[p].hand.push(ph.tile);win(g,p,ph.tile,ph.from,now);
}
function endDraw(g,now){g.h.over=true;g.result={kind:'draw',title:'流局',text:'牌墙只剩 20 张，本盘不计分。'};phase(g,'handEnd',{ready:[]},now);}
function win(g,p,t,robbed,now){
  const P=g.h.P[p],noMelds=g.h.P.every(x=>!x.melds.length);
  const result=R.scoreWin({concealed:P.hand.slice(),melds:P.melds.map(m=>m.tiles),meldFrom:P.melds.map(m=>m.from),winTile:t,wealth:g.h.wealth,flowers:P.flowers.length,afterKong:g.h.kongDraw,
    tianHu:p===g.h.dealer&&g.h.P.every(x=>!x.hasDisc)&&noMelds&&P.draws===0,diHu:p!==g.h.dealer&&P.draws===1&&noMelds,piaoCount:P.piao});
  const imm=g.mode==='ju'?result.total-result.special:result.total;
  if(robbed!==null){g.scores[robbed]-=imm*3;g.scores[p]+=imm*3;}else for(const q of seats)if(q!==p){g.scores[q]-=imm;g.scores[p]+=imm;}
  if(g.mode==='ju')g.specials[p]+=result.special;
  g.h.over=true;g.result={kind:'win',winner:p,robbed,tiles:P.hand.slice(),melds:copy(P.melds),...result,paid:imm};
  event(g,'座位 '+p+(robbed===null?' 自摸':' 抢杠胡'));phase(g,'handEnd',{ready:[]},now);
}
export function applyAction(g,p,a,now=Date.now()){
  if(!Number.isInteger(p)||p<0||p>3||!a||typeof a!=='object')fail('操作无效');
  const ph=g.phase,P=g.h.P[p];
  if(ph.kind==='handEnd'||ph.kind==='matchEnd'){
    if(a.act!=='ready')fail('本盘已结束');if(ph.ready.includes(p))fail('已准备，请等待其他同学');
    ph.ready.push(p);g.revision++;return;
  }
  if(ph.kind==='claim'||ph.kind==='rob'){
    if(a.act!=='claim'||!ph.offers[p]||Object.hasOwn(ph.replies,p))fail('这个响应窗口已结束');
    const r=a.choice;
    if(r!==null&&!ph.offers[p].some(o=>o.act===r?.act&&JSON.stringify(o.opt||null)===JSON.stringify(r.opt||null)))fail('不可执行该吃碰杠操作');
    ph.replies[p]=r===null?null:copy(ph.offers[p].find(o=>o.act===r.act&&JSON.stringify(o.opt||null)===JSON.stringify(r.opt||null)));
    if(Object.keys(ph.offers).every(q=>Object.hasOwn(ph.replies,q))){if(ph.kind==='rob')resolveRob(g,now);else resolveClaim(g,now);}
    g.revision++;return;
  }
  if(ph.kind!=='turn'||ph.actor!==p)fail('还没轮到你，请同步最新牌局');
  if(a.act==='discard'){
    if(!P.hand.includes(a.tile))fail('这张牌已不在手中');
    if(a.tile===g.h.wealth&&a.confirmWealth!==true)fail('打出财神需要额外确认');
    remove(P,a.tile);P.hasDisc=true;g.h.kongDraw=false;g.h.discards[p].push(a.tile);g.h.lastDiscard={p,tile:a.tile};
    if(a.tile===g.h.wealth&&R.waitTiles(P.hand,g.h.wealth,4-P.melds.length).length===34)P.piao++;
    event(g,'座位 '+p+' 打出 '+a.tile);claims(g,p,a.tile,now);
  }else{
    const legal=turnOptions(g,p).find(o=>o.act===a.act&&(o.t===undefined||o.t===a.t)&&(o.mi===undefined||o.mi===a.mi));
    if(!legal)fail('当前不可执行此动作');
    if(a.act==='win')win(g,p,g.h.drawn||P.hand.at(-1),null,now);
    else if(a.act==='angang'){remove(P,a.t,4);P.melds.push({type:'gang',tiles:Array(4).fill(a.t)});event(g,'座位 '+p+' 暗杠');turn(g,p,true,true,now);}
    else{
      const offers={};for(const q of seats)if(q!==p&&R.canWinStruct(g.h.P[q].hand.concat(a.t),g.h.wealth,4-g.h.P[q].melds.length))offers[q]=[{act:'qiang'}];
      if(Object.keys(offers).length)phase(g,'rob',{from:p,mi:a.mi,tile:a.t,offers,replies:{},deadline:now+CLAIM_MS},now);
      else completeKong(g,p,a.mi,a.t,now);
    }
  }
  g.revision++;
}
export function aiAction(g,p){
  const options=turnOptions(g,p);if(options.length)return options[0];
  const P=g.h.P[p],c=R.counts(P.hand);let best=P.hand[0],value=Infinity;
  for(const t of P.hand){if(t===g.h.wealth)continue;let v=(c[t]-1)*3;const n=R.numOf(t),s=R.suitOf(t);
    if(s){for(const d of [-2,-1,1,2])if(n+d>0&&n+d<10&&c[(n+d)+s])v+=Math.abs(d)===1?1.6:.6;}
    else v-=.4;
    if(v<value){value=v;best=t;}
  }
  return {act:'discard',tile:best,confirmWealth:true};
}
export function tickGame(g,online,now=Date.now(),offlineAt={}){
  const ph=g.phase,isAI=p=>!g.humans.includes(+p)||!online.includes(+p);
  if(ph.kind==='turn'){
    const wait=g.humans.includes(ph.actor)?5000:AI_DELAY;
    if(isAI(ph.actor)&&now>=Math.max(ph.since,offlineAt[ph.actor]||0)+wait){applyAction(g,ph.actor,aiAction(g,ph.actor),now);return true;}
  }else if(ph.kind==='claim'||ph.kind==='rob'){
    for(const p of Object.keys(ph.offers))if(!Object.hasOwn(ph.replies,p)&&((isAI(p)&&now>=ph.since+AI_DELAY)||now>=ph.deadline)){
      const choice=now>=ph.deadline?null:ph.offers[p][0];applyAction(g,+p,{act:'claim',choice},now);return true;
    }
  }else if(ph.kind==='handEnd'||ph.kind==='matchEnd'){
    if(online.length&&online.filter(p=>g.humans.includes(p)).every(p=>ph.ready.includes(p))){
      if(ph.kind==='matchEnd'){
        const fresh=createGame(g.mode,g.humans,now);fresh.revision=g.revision+1;Object.assign(g,fresh);
      }else if((g.mode==='p8'&&g.hand>=7)||(g.mode==='ju'&&g.scores.some(s=>s<=0))){
        const finals=g.mode==='ju'?g.scores.map((s,p)=>Math.max(0,s+g.specials[p])):g.scores.slice();
        g.result={kind:'match',scores:finals,rank:seats.slice().sort((a,b)=>finals[b]-finals[a])};phase(g,'matchEnd',{ready:[]},now);g.revision++;
      }else{g.hand++;startHand(g,now);g.revision++;}
      return true;
    }
  }
  return false;
}
export function nextWake(g,online,now=Date.now(),offlineAt={}){
  if(!online.length)return null;
  const ph=g.phase;
  if(ph.kind==='turn')return !g.humans.includes(ph.actor)||!online.includes(ph.actor)?Math.max(now+50,Math.max(ph.since,offlineAt[ph.actor]||0)+(g.humans.includes(ph.actor)?5000:AI_DELAY)):null;
  if(ph.kind==='claim'||ph.kind==='rob'){
    const ai=Object.keys(ph.offers).some(p=>!Object.hasOwn(ph.replies,p)&&(!g.humans.includes(+p)||!online.includes(+p)));
    return Math.max(now+50,Math.min(ph.deadline,ai?ph.since+AI_DELAY:ph.deadline));
  }
  return null;
}
export function seatState(g,p){
  const out=copy(g);out.h.wall=Array(g.h.wall.length).fill('…');
  for(const q of seats)if(q!==p)out.h.P[q].hand=Array(g.h.P[q].hand.length).fill('白');
  if(g.h.turn!==p)out.h.drawn=null;
  out.phase={kind:g.phase.kind,id:g.phase.id,actor:g.phase.actor,from:g.phase.from,tile:g.phase.tile,deadline:g.phase.deadline,ready:g.phase.ready,
    offers:copy(g.phase.offers?.[p]||[]),responded:Object.hasOwn(g.phase.replies||{},p)};
  out.options=turnOptions(g,p);return out;
}
export function assertGame(g){
  if(g.h.dice){
    const d=g.h.dice;if(!Array.isArray(d.pairs)||d.pairs.length!==4||d.pairs.some(pair=>!Array.isArray(pair)||pair.length!==2||pair.some(n=>!Number.isInteger(n)||n<1||n>6)))fail('骰子点数无效');
    const totals=d.pairs.map(pair=>pair[0]+pair[1]);
    if(g.h.dealer!==totals.indexOf(Math.max(...totals))||JSON.stringify(d.values)!==JSON.stringify(d.pairs[g.h.dealer]))fail('定庄结果与骰子不一致');
  }
  let n=g.h.wall.length;for(const P of g.h.P)n+=P.hand.length+P.flowers.length+P.melds.reduce((s,m)=>s+m.tiles.length,0);
  n+=g.h.discards.reduce((s,a)=>s+a.length,0);if(n!==144)fail('牌数守恒失败 '+n);
  if(g.scores.reduce((a,b)=>a+b,0)!==(g.mode==='ju'?120:0))fail('分数守恒失败');
}
