/* 江山麻将核心引擎：牌型 / 胡牌检测（财神百搭）/ 算分 */
const SUITS=['万','条','筒'],HONORS=['东','南','西','北','中','发','白'],FLOWERS=['春','夏','秋','冬','梅','兰','竹','菊'];
const ORDER=[];SUITS.forEach(s=>{for(let n=1;n<10;n++)ORDER.push(n+s)});HONORS.forEach(h=>ORDER.push(h));
const valOf=t=>ORDER.indexOf(t);
const isFlower=t=>FLOWERS.includes(t);
const isHonor=t=>HONORS.includes(t);
const suitOf=t=>SUITS.includes(t.at(-1))?t.at(-1):null;
const numOf=t=>suitOf(t)?+t[0]:0;
const shuffled=a=>a.map(x=>[Math.random(),x]).sort((p,q)=>p[0]-q[0]).map(p=>p[1]);
function makeDeck(){const d=[];SUITS.forEach(s=>{for(let n=1;n<10;n++)for(let k=0;k<4;k++)d.push(n+s)});HONORS.forEach(h=>{for(let k=0;k<4;k++)d.push(h)});return shuffled(d.concat(FLOWERS.slice()))}
/* 财神 = 翻牌的下一张：数字牌按同花色循环（9万→1万，9条→1条，9筒→1筒），字牌按东南西北中发白循环 */
function nextTile(t){const i=ORDER.indexOf(t);if(i<0)return null;if(i<27){const s=SUITS[Math.floor(i/9)],n=i%9;return ((n+2)%9||9)+s}return HONORS[(HONORS.indexOf(t)+1)%7]}
const counts=a=>{const m={};a.forEach(t=>m[t]=(m[t]||0)+1);return m};

/* ---------- 胡牌检测（needSets = 4 - 已副露组数，tiles 为暗牌+胡牌张，长度须为 3*needSets+2） ---------- */
function canWinStruct(tiles,wealth,needSets){
  if(tiles.length!==3*needSets+2)return false;
  const jk=tiles.filter(t=>t===wealth).length,rest=tiles.filter(t=>t!==wealth),c=counts(rest);
  if(needSets===4){
    if(winSevenPairs(rest,jk))return true;
    if(winThirteen(rest,jk))return true;
  }
  return winStandard(c,jk,needSets);
}
/* 一对将 + needSets 组刻/顺（财神百搭补位） */
function winStandard(c,jk,needSets){
  for(const k in c){if(c[k]>=2){c[k]-=2;if(decompose(c,jk))return true;c[k]+=2}}
  if(jk>=1)for(const k in c){if(c[k]<1)continue;c[k]--;if(decompose(c,jk-1))return true;c[k]++}
  if(jk>=2&&decompose(c,jk-2))return true;
  return false;
}
/* 回溯拆解：所有非零牌归组（刻子/顺子），财神可补 1-2 张；剩余财神须能 3 个成刻 */
function decompose(c,jk){
  let k=null;for(const t of ORDER){if(c[t]>0){k=t;break}}
  if(k===null)return jk%3===0;
  const n=numOf(k),s=suitOf(k);
  if(c[k]>=3){c[k]-=3;if(decompose(c,jk))return true;c[k]+=3}
  if(c[k]>=2&&jk>=1){c[k]-=2;if(decompose(c,jk-1))return true;c[k]+=2}
  if(c[k]>=1&&jk>=2){c[k]--;if(decompose(c,jk-2))return true;c[k]++}
  if(s){
    // 最小实牌也可以在顺子的中间或末尾，例如 财神+8万+9万。
    for(let start=Math.max(1,n-2);start<=Math.min(n,7);start++){
      const seq=[start+s,(start+1)+s,(start+2)+s];
      const used=seq.filter(t=>c[t]>0),need=3-used.length;
      if(jk<need)continue;
      used.forEach(t=>c[t]--);
      if(decompose(c,jk-need))return true;
      used.forEach(t=>c[t]++);
    }
  }
  return false;
}
/* 碰碰胡：将 + 全刻子（无顺子） */
function isPengPeng(tiles,wealth){
  const jk=tiles.filter(t=>t===wealth).length,rest=tiles.filter(t=>t!==wealth),c=counts(rest);
  const trip=(cc,j)=>{let k=null;for(const t of ORDER){if(cc[t]>0){k=t;break}}
    if(k===null)return j%3===0;
    if(cc[k]>=3){cc[k]-=3;if(trip(cc,j))return true;cc[k]+=3}
    if(cc[k]>=2&&j>=1){cc[k]-=2;if(trip(cc,j-1))return true;cc[k]+=2}
    if(cc[k]>=1&&j>=2){cc[k]--;if(trip(cc,j-2))return true;cc[k]++}
    return false};
  for(const k in c){if(c[k]>=2){c[k]-=2;if(trip(c,jk))return true;c[k]+=2}}
  if(jk>=1)for(const k in c){c[k]--;if(trip(c,jk-1))return true;c[k]++}
  if(jk>=2&&trip(c,jk-2))return true;
  return false;
}
/* 对对胡：七对子（财神可与单张配对或自pair） */
function winSevenPairs(rest,jk){
  const c=counts(rest);let odd=0;for(const k in c)if(c[k]%2)odd++;
  return odd<=jk&&(jk-odd)%2===0;
}
/* 十三烂：同花色任意两张差≥3，字牌互不相同（财神补空位，须门清 14 张） */
function winThirteen(rest,jk){
  if(rest.length+jk!==14)return false;
  const c=counts(rest);
  for(const t in c)if(c[t]>1)return false;
  /* 同花色内任意两张数字差≥3 */
  const nums={};
  for(const t in c){const s=suitOf(t);if(s)(nums[s]??=[]).push(+t[0])}
  for(const s in nums){const a=nums[s].sort((x,y)=>x-y);
    for(let i=1;i<a.length;i++)if(a[i]-a[i-1]<3)return false}
  const cand=[];HONORS.forEach(h=>{if(!c[h])cand.push(h)});
  SUITS.forEach(s=>{const pr=[];for(let n=1;n<10;n++)if(c[n+s])pr.push(n);
    for(let n=1;n<10;n++)if(!c[n+s]&&pr.every(p=>Math.abs(p-n)>=3))cand.push(n+s)});
  if(jk===0)return true;
  const pick=(start,ch)=>{if(ch.length===jk)return true;
    for(let i=start;i<cand.length;i++){const t=cand[i];
      if(ch.every(u=>suitOf(u)!==suitOf(t)||Math.abs(numOf(u)-numOf(t))>=3)){ch.push(t);if(pick(i+1,ch))return true;ch.pop()}}
    return false};
  return pick(0,[]);
}
/* 听牌计算：13 张暗牌胡哪些张（用于单吊/财吊/抢杠判定） */
function waitTiles(hand13,wealth,needSets){
  const w=[];for(const t of ORDER){if(canWinStruct(hand13.concat(t),wealth,needSets))w.push(t)}return w;
}
/* 清一色：暗牌+副露（财神视作任意花色）全为同一门数字牌 */
function isQingYiSe(concealed,melds,wealth){
  let suit=null;
  for(const t of concealed.concat(...melds)){if(t===wealth)continue;const s=suitOf(t);if(!s)return false;if(suit&&s!==suit)return false;suit=s}
  return true;
}
/* 吃牌组合：hand 中与 t 组成顺子的两牌组合 */
function chiOptions(t,hand){
  if(!suitOf(t))return[];
  const n=numOf(t),s=suitOf(t),c=counts(hand),r=[];
  [[n-2,n-1],[n-1,n+1],[n+1,n+2]].forEach(q=>{
    if(q[0]>0&&q[1]<10&&q.every(x=>c[x+s]>=(x===n?2:1))){/* 同名两张不可同用 */}
    if(q[0]>0&&q[1]<10){const a=q[0]+s,b=q[1]+s;const need=[a,b].filter(x=>c[x]>0);if(need.length===2)r.push([a,b])}
  });
  return r;
}
/* ---------- 算分 ---------- */
/* ctx:{concealed:胡牌时14-3m张暗牌(含胡张), melds:[[t,t,t]...], winTile, wealth, flowers,
       afterKong, tianHu, diHu, piaoCount, robKong, mode} */
function scoreWin(ctx){
  const wealth=ctx.wealth,needSets=4-ctx.melds.length;
  const tiles=ctx.concealed;
  const detail=[];let base=0,type='';
  if(needSets===4&&winThirteen(tiles.filter(t=>t!==wealth),tiles.filter(t=>t===wealth).length)){type='十三烂';base=6}
  else if(needSets===4&&winSevenPairs(tiles.filter(t=>t!==wealth),tiles.filter(t=>t===wealth).length)){type='对对胡';base=6}
  else if(ctx.melds.every(m=>m.every(t=>t===m[0]))&&isPengPeng(tiles,wealth)){type='碰碰胡';base=6}
  else{type='平胡';base=2}
  detail.push([type+'（基础分）',base]);
  let extra=0;
  /* 单吊/财吊：按听牌张数精确判定（胡牌前 13 张暗牌） */
  const h13=tiles.filter(t=>t!==ctx.winTile).concat(tiles.filter(t=>t===ctx.winTile).slice(1));
  if(h13.length===3*needSets+1){
    const waits=waitTiles(h13,wealth,needSets);
    if(waits.length===ORDER.length){detail.push(['财吊',2]);extra+=2}
    else if(waits.filter(t=>t!==wealth).length===1){detail.push(['单吊',2]);extra+=2}
  }
  if(ctx.afterKong){detail.push(['杠开',2]);extra+=2}
  let mult=Math.pow(2,ctx.piaoCount||0);
  if(mult>1)detail.push(['飘财 ×'+mult,0]);
  let special=0;
  /* 清一色：若吃/碰/明杠同一玩家三手以上，不计清一色分（江山规矩） */
  let qys=isQingYiSe(tiles,ctx.melds,wealth);
  if(qys&&ctx.meldFrom){
    const fc={};ctx.meldFrom.forEach(f=>{if(f!==undefined)fc[f]=(fc[f]||0)+1});
    if(Object.values(fc).some(n=>n>=3))qys=false;
  }
  if(qys){detail.push(['清一色',10]);special+=10}
  if(ctx.tianHu){detail.push(['天胡',10]);special+=10}
  if(ctx.diHu){detail.push(['地胡',10]);special+=10}
  if(ctx.flowers>0){detail.push(['花牌 ×'+ctx.flowers,ctx.flowers]);special+=ctx.flowers}
  const total=(base+extra)*mult+special;
  return {type,detail,total,payEach:total,special};
}
// Shared pure rules API for the authoritative room engine and its tests.
globalThis.MahjongRules=Object.freeze({ORDER,SUITS,HONORS,FLOWERS,valOf,isFlower,suitOf,numOf,makeDeck,nextTile,counts,canWinStruct,waitTiles,chiOptions,scoreWin});
