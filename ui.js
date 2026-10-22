/* 渲染层：牌面 / 座位 / 弃牌区 / 动作条 / 弹窗 */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const NAMES=['林林','超超','含含','政政'];
const CN='一二三四五六七八九';
let G=null;
const escapeHTML=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let selectedHandIndex=-1,handSignature='';
const FLOWER_META={
  '春':{n:1,col:'#c41e1e'},'夏':{n:2,col:'#c41e1e'},'秋':{n:3,col:'#c41e1e'},'冬':{n:4,col:'#c41e1e'},
  '梅':{n:1,col:'#c41e1e'},'兰':{n:2,col:'#3b5998'},'竹':{n:3,col:'#2a8a2a'},'菊':{n:4,col:'#7a3db8'}
};
function flowerArt(f){
  switch(f){
    case '春':return '<rect x="13" y="16" width="2" height="14" fill="#4a8a3a"/><rect x="9" y="12" width="10" height="8" rx="2" fill="#e85a5a"/><rect x="12" y="14" width="4" height="4" fill="#ffd94d"/><rect x="6" y="18" width="5" height="2" fill="#4a8a3a"/><rect x="17" y="18" width="5" height="2" fill="#4a8a3a"/>';
    case '夏':return '<rect x="10" y="28" width="8" height="4" rx="2" fill="#2a8a2a"/><ellipse cx="14" cy="22" rx="5" ry="3" fill="#e85a8a"/><rect x="13" y="16" width="2" height="6" fill="#e85a8a"/><ellipse cx="11" cy="20" rx="2" ry="3" fill="#e85a8a"/><ellipse cx="17" cy="20" rx="2" ry="3" fill="#e85a8a"/>';
    case '秋':return '<circle cx="14" cy="25" r="4" fill="#e8a030"/><path d="M14 17 v16 M10 21 h8 M11 19 l6 12 M17 19 l-6 12" stroke="#d98c1e" stroke-width="1.5" fill="none"/>';
    case '冬':return '<path d="M14 34 v-12" stroke="#5a3a1e" stroke-width="2" fill="none"/><circle cx="14" cy="19" r="3" fill="#e85a8a"/><circle cx="10" cy="22" r="2.5" fill="#e85a8a"/><circle cx="18" cy="22" r="2.5" fill="#e85a8a"/>';
    case '梅':return '<path d="M8 32 q6 -5 12 -11" stroke="#5a3a1e" stroke-width="2" fill="none"/><circle cx="18" cy="20" r="2.5" fill="#e85a8a"/><circle cx="14" cy="24" r="2" fill="#e85a8a"/>';
    case '兰':return '<path d="M10 33 q-2 -9 4 -15" stroke="#2a8a2a" stroke-width="2" fill="none"/><path d="M18 33 q2 -9 -4 -15" stroke="#2a8a2a" stroke-width="2" fill="none"/><circle cx="14" cy="17" r="2" fill="#3b5998"/><path d="M12 19 l2 3 l2 -3" stroke="#3b5998" stroke-width="1" fill="none"/>';
    case '竹':return '<rect x="11" y="15" width="2" height="18" fill="#2a8a2a"/><rect x="15" y="15" width="2" height="18" fill="#2a8a2a"/><rect x="10" y="20" width="4" height="1" fill="#1d5c1d"/><rect x="14" y="26" width="4" height="1" fill="#1d5c1d"/>';
    case '菊':return '<circle cx="14" cy="25" r="3" fill="#7a3db8"/><path d="M14 17 v16 M10 21 h8 M11 19 l6 12 M17 19 l-6 12" stroke="#6b2fa5" stroke-width="1.2" fill="none"/>';
  }return '';
}
function flowerFace(f){
  const m=FLOWER_META[f];if(!m)return `<span class="feng">${f}</span>`;
  return `<svg class="hua" viewBox="0 0 28 40" preserveAspectRatio="xMidYMid meet" aria-label="${f}">${flowerArt(f)}<text x="3" y="7" font-size="6" fill="#1a1a1a" font-weight="bold" font-family="Arial,sans-serif">${m.n}</text><text x="25" y="7" font-size="6" fill="${m.col}" font-weight="bold" font-family="Arial,sans-serif" text-anchor="end">${f}</text></svg>`;
}
function birdSvg(){
  return `<svg viewBox="0 0 40 56" preserveAspectRatio="xMidYMid meet" aria-label="一条"><g fill="none"><path d="M8 40 L2 28 M8 40 L2 40 M8 40 L2 52" stroke="#2a9a62" stroke-width="3.5" stroke-linecap="round"/><ellipse cx="22" cy="36" rx="13" ry="15" fill="#3cb371"/><circle cx="30" cy="20" r="10" fill="#3cb371"/><circle cx="33" cy="17" r="3" fill="#c41e1e"/><path d="M38 18 L44 21 L38 24 Z" fill="#e89a3c"/><ellipse cx="17" cy="36" rx="7" ry="10" fill="#258a58"/><line x1="17" y1="50" x2="13" y2="56" stroke="#e89a3c" stroke-width="2.5" stroke-linecap="round"/><line x1="27" y1="50" x2="31" y2="56" stroke="#e89a3c" stroke-width="2.5" stroke-linecap="round"/></g></svg>`;
}
function innerFace(t){
  if(FLOWER_META[t])return flowerFace(t);
  const s=suitOf(t);
  if(s==='万'){const n=+t[0];return `<span class="wan"><i class="num">${CN[n-1]}</i><i class="suit">萬</i></span>`}
  if(s==='条'&&t[0]==='1')return `<span class="tiao bird">${birdSvg()}</span>`;
  if(s==='条')return `<span class="tiao">${'<i></i>'.repeat(+t[0])}</span>`;
  if(s==='筒')return `<span class="tong">${'<i></i>'.repeat(+t[0])}</span>`;
  if(t==='中')return `<span class="zhong">中</span>`;
  if(t==='发')return `<span class="fa">發</span>`;
  if(t==='白')return `<span class="bai"><i></i></span>`;
  return `<span class="feng">${t}</span>`;
}
function face(t,cls='tile'){return `<span class="${cls}" role="img" aria-label="${escapeHTML(t)}">${innerFace(t)}</span>`}
function backTile(){return '<span class="tile back"></span>'}
function meldFace(m,own=false){
  const concealed=m.type==='gang'&&!Number.isInteger(m.from);
  const label=concealed?'暗杠':({chi:'吃',peng:'碰',gang:'杠'}[m.type]||'');
  const tiles=m.tiles.map((t,i)=>concealed&&(!own||i===0||i===m.tiles.length-1)?'<span class="mtile s back" role="img" aria-label="暗杠牌背"></span>':face(t,own?'mtile':'mtile s')).join('');
  return `<span class="meld ${m.type}" aria-label="${label}"><small class="meld-label">${label}</small><span class="meld-tiles">${tiles}</span></span>`;
}
function renderHand(){
  const P=G.h.P[0];
  P.hand.sort((a,b)=>valOf(a)-valOf(b));
  const signature=P.hand.join('|')+':'+G.h.turn+':'+G.hand+':'+(G.phase?.id||'');
  if(signature!==handSignature){selectedHandIndex=-1;handSignature=signature;}
  $('#hand').innerHTML=P.hand.map((t,i)=>`<button class="tile ${t===G.h.wealth?'wealth':''} ${i===selectedHandIndex?'selected':''}" data-i="${i}" aria-label="${t}${t===G.h.wealth?'，财神':''}" aria-pressed="${i===selectedHandIndex}">${innerFace(t)}</button>`).join('');
  $('#myMelds').innerHTML=P.melds.map(m=>meldFace(m,true)).join('');
  $('#flowerTiles').innerHTML=P.flowers.map(f=>face(f,'ftile')).join('');
  $('#flowers').textContent='花 '+P.flowers.length;
  renderHandControls();
}
function canChooseTile(){return !!(G&&G.h&&!G.h.over&&!G.h.turnActionTaken&&G.h.turn===0&&G.h.P[0].hand.length===3*(4-G.h.P[0].melds.length)+2&&(typeof Net==='undefined'||!Net.active||Net.canAct()));}
function renderHandControls(){
  const b=$('#discardBtn');if(!b)return;
  b.disabled=!canChooseTile()||selectedHandIndex<0;
  const t=G.h.P[0].hand[selectedHandIndex];
  b.textContent=typeof Net!=='undefined'&&Net.active&&Net.pending?'等待确认…':t?(t===G.h.wealth&&G.h.warnWealth?'确认打出财神':'打出 '+t):'选择一张牌';
  const portrait=typeof matchMedia==='function'&&matchMedia('(orientation:portrait) and (max-width:700px)').matches;
  const hint=$('#tileHint');if(hint)hint.textContent=canChooseTile()?(selectedHandIndex<0?(portrait?'左右滑动看牌 · 横屏可看全手牌':'点选一张手牌，再点「打出」'):'已选 '+t+' · 点「打出」确认'):(G.h.over?'本盘结束，查看结算':portrait?'左右滑动看牌 · 等待同学行牌':'等待其他同学行牌');
}
function selectHandTile(i){
  if(!canChooseTile()||!Number.isInteger(i)||i<0||i>=G.h.P[0].hand.length)return;
  selectedHandIndex=i;G.h.warnWealth=false;renderHand();
  const hint=$('#tileHint');if(hint)hint.textContent='已选 '+G.h.P[0].hand[i]+' · 点「打出」确认';
}
function renderOpp(q){
  const P=G.h.P[q],el=$('#opp-'+q);
  const actual=typeof Net!=='undefined'&&Net.active&&Net.pid>=0?(Net.pid+q)%4:q;
  el.querySelector('.avatar').src=['avatar-linlin.png','avatar-chaochao.png','avatar-hanhan.png','avatar-zhengzheng.png'][actual];
  el.querySelector('.backs').innerHTML=backTile().repeat(P.hand.length);
  el.querySelector('.backs').ariaLabel='未公开手牌 '+P.hand.length+' 张';
  el.querySelector('.omelds').innerHTML=P.melds.map(m=>meldFace(m)).join('');
  el.querySelector('.omelds').ariaLabel='已亮出的吃碰杠';
  el.querySelector('.oflowers').textContent=P.flowers.length?'花'+P.flowers.length:'';
  el.classList.toggle('active',G.h.turn===q&&!G.h.over);
}
function renderDiscards(){
  const rows=Math.max(2,...G.h.discards.map(a=>Math.ceil(a.length/6)));
  $('.center-board').style.setProperty?.('--river-rows',String(rows));
  for(let q=0;q<4;q++){
    const e=$('#discards-'+q),tiles=G.h.discards[q];
    e.innerHTML=tiles.map((t,i)=>face(t,'dtile'+(G.h.lastDiscard?.p===q&&i===tiles.length-1&&G.h.lastDiscard.tile===t?' last-discard':''))).join('');
    e.ariaLabel='查看 '+NAMES[q]+' 的弃牌，共 '+tiles.length+' 张';
    e.title=NAMES[q]+' 的弃牌 · '+tiles.length+' 张';
    e.dataset.player=NAMES[q];e.dataset.count=String(tiles.length);
    e.disabled=!tiles.length;
  }
  layoutDiscards();
  if($('#discardsDialog')?.open)renderDiscardsDetail();
}
function layoutDiscards(){
  const board=$('.center-board');if(!G?.h||!board)return;
  const rows=Math.max(2,...G.h.discards.map(a=>Math.ceil(a.length/6)));
  // Four seat-oriented rivers, six tiles per row. Reserve separate horizontal
  // bands for the rotated side rivers, even with three full rows late in play.
  const w=board.clientWidth||360,h=board.clientHeight||160;
  let tileHeight=Math.max(8,Math.floor(Math.min(30,(h-24-2*(rows-1))/(2*rows+2.4),(w-25-2*(rows-1))/(4.32+2*rows))));
  const hubHeight=Math.max(38,Math.floor(tileHeight*2.4+8));
  tileHeight=Math.max(8,Math.floor(Math.min(tileHeight,(h-hubHeight-16-2*(rows-1))/(2*rows))));
  board.style.setProperty?.('--river-h',tileHeight+'px');
  board.style.setProperty?.('--hub-h',hubHeight+'px');
  board.style.setProperty?.('--hub-w',Math.max(52,Math.floor(tileHeight*3.6+8))+'px');
}
let inspectedDiscardSeat=0;
function renderDiscardsDetail(){
  const p=inspectedDiscardSeat,tiles=G?.h?.discards[p]||[];
  $('#discardsTitle').textContent=NAMES[p]+' 的弃牌 · '+tiles.length+' 张';
  $('#discardsBody').innerHTML=tiles.length?'<div class="discards-detail">'+tiles.map(t=>face(t,'dtile')).join('')+'</div>':'<p class="empty-discard">这位同学还没有打过牌。</p>';
}
function dieFace(n){
  const dots={1:[5],2:[1,9],3:[1,5,9],4:[1,3,7,9],5:[1,3,5,7,9],6:[1,3,4,6,7,9]};
  return dots[n]?`<span class="die-face ${n===1?'die-one':''}" role="img" aria-label="${n}点">${dots[n].map(p=>`<i class="pip p${p}" aria-hidden="true"></i>`).join('')}</span>`:'';
}
function renderDice(){
  const el=$('#diceBox'),d=G.h.dice;
  if(!el)return;
  el.disabled=!d?.pairs||d.rolling;
  if(!d){el.innerHTML='<span class="dice-summary">本盘庄家 '+escapeHTML(NAMES[G.h.dealer])+'</span>';el.title='本盘的骰子未记录，下一盘显示';return;}
  const [a,b]=d.values;
  el.innerHTML='<span class="dice-pair">'+dieFace(a)+dieFace(b)+'</span><span class="dice-summary"><small>掷骰定庄</small><strong>'+(d.rolling?'掷骰中…':a+' + '+b+' = '+(a+b)+' 点')+'</strong></span>';
  el.title=d.rolling?'正在掷骰':'查看四位同学的定庄点数';
  if($('#diceDialog')?.open)renderDiceDetails();
}
function renderDiceDetails(){
  const d=G?.h?.dice;if(!d?.pairs)return;
  $('#diceBody').innerHTML='<p>每人掷两颗骰子，总点数最高的同学坐庄。</p><div class="dice-results">'+d.pairs.map((pair,p)=>'<div class="dice-result '+(p===G.h.dealer?'is-dealer':'')+'"><span class="dice-player">'+escapeHTML(NAMES[p])+'</span><span class="dice-pair">'+pair.map(dieFace).join('')+'</span><strong>'+pair[0]+' + '+pair[1]+' = '+(pair[0]+pair[1])+' 点</strong><span class="dealer-badge">'+(p===G.h.dealer?'庄家':'')+'</span></div>').join('')+'</div><p class="dice-explanation">同点时按座位顺序决定。这些点数属于当前这一盘。</p>';
}
function renderInfo(){
  renderDice();
  $('#wealthBox').innerHTML=G.h.ind?`<small>翻牌</small>${face(G.h.ind,'mtile s')}<small>财神</small>${face(G.h.wealth,'mtile s gold')}`:'<small>掷骰定庄中…</small>';
  $('#wallCount').textContent=G.h.wall.length;
  $('#wallCount').ariaLabel='牌墙剩余 '+G.h.wall.length+' 张';
  $$('.hub-wind').forEach(e=>{const q=+e.dataset.seat;e.textContent=['东','南','西','北'][(q-G.h.dealer+4)%4];e.classList.toggle('on',G.h.turn===q&&!G.h.over);});
  $('#turnLabel').textContent=G.h.over?'本盘结束':G.phase?.kind==='claim'||G.phase?.kind==='rob'?'等待吃碰杠胡响应':NAMES[G.h.turn]+' 行牌';
  $('#handNo').textContent=(G.mode==='ju'?'局麻':'第 '+(G.hand+1)+'/8 盘');
}
function renderScores(){
  for(let q=0;q<4;q++){
    const el=q===0?$('#myScore'):$(`.oscore[data-p="${q}"]`);
    if(!el)continue;
    el.innerHTML=`${escapeHTML(NAMES[q])} <b>${G.scores[q]}</b>${q===G.h.dealer?'<span class="dealer-flag">庄</span>':''}${G.mode==='ju'&&G.specials[q]?'<i>+'+G.specials[q]+'★</i>':''}`;
    el.classList.toggle('on',G.h.turn===q&&!G.h.over);
  }
}
function renderAll(){renderHand();renderOpp(1);renderOpp(2);renderOpp(3);renderDiscards();renderInfo();renderScores()}
/* 动作条 */
function setActions(list){
  $('#actionBar').innerHTML=list.map((a,i)=>`<button class="abtn ${i===0?'hot':''} ${a.label.includes('⚠')?'warn':''}" data-a="${i}">${a.label}</button>`).join('');
  $('#actionBar').hidden=!list.length;
  $$('#actionBar .abtn').forEach(b=>b.onclick=()=>{const a=list[+b.dataset.a];clearActions();a.fn()});
}
function clearActions(){$('#actionBar').innerHTML='';$('#actionBar').hidden=true}
/* 弹窗 */
function showModal(html,btns){
  $('#modalBody').innerHTML=html;
  $('#modalBtns').innerHTML=(btns||[]).map((b,i)=>`<button data-m="${i}">${b.label}</button>`).join('');
  $$('#modalBtns button').forEach(b=>b.onclick=()=>{$('#modal').classList.remove('show');(btns[+b.dataset.m].fn||(()=>{}))()});
  $('#modal').classList.add('show');
}
function note(x){$('#statusText').textContent=x}
/* 像素音效 + 背景音乐：三首网页 MP3 随机播放，也可上传本地 MP3 */
let audio,loop,musicOn=true,localAudio=null,localSource='playlist',bgmIndex=-1;
const BGM_TRACKS=[
  {src:'bgm-1.mp3',name:'像素晴天'},
  {src:'bgm-2.mp3',name:'随机曲目 2'},
  {src:'bgm-3.mp3',name:'随机曲目 3'}
];
const TRACKS=[
  {name:'像素晴天',notes:[523,659,784,880,784,659,587,659,698,784,1046,784],beat:220},
  {name:'课间小调',notes:[392,440,494,523,494,440,392,440,494,523,587,523],beat:260},
  {name:'麻雀圆舞曲',notes:[440,494,523,494,440,392,440,523,587,523,494,440],beat:240}
];let trackIdx=0;
function beep(f,d=.18){if(!audio||!musicOn||localAudio)return;const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.value=f;g.gain.setValueAtTime(.032,audio.currentTime);g.gain.exponentialRampToTimeAtTime(.001,audio.currentTime+d);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+d)}
function music(){if(localAudio)return;audio??=new AudioContext();audio.resume();clearInterval(loop);const t=TRACKS[trackIdx];let i=0;loop=setInterval(()=>{beep(t.notes[i++%t.notes.length],t.beat/1200)},t.beat)}
function nextTrack(){trackIdx=(trackIdx+1)%TRACKS.length;if(musicOn&&!localAudio){music();note('🎵 '+TRACKS[trackIdx].name+'（像素电台，上传本地 MP3 可听流行乐）')}}
function pickBgmIndex(){
  if(BGM_TRACKS.length<2)return 0;
  let i=Math.floor(Math.random()*BGM_TRACKS.length);
  while(i===bgmIndex)i=Math.floor(Math.random()*BGM_TRACKS.length);
  return i;
}
function startPlaylistAudio(){
  if(!musicOn)return;
  if(localAudio){localAudio.pause();localAudio=null}
  clearInterval(loop);
  const idx=pickBgmIndex(),track=BGM_TRACKS[idx];bgmIndex=idx;
  const player=new Audio(track.src);player.preload='auto';player.loop=false;player.volume=.45;
  player.onended=()=>{if(musicOn&&localAudio===player){localAudio=null;startPlaylistAudio()}};
  localAudio=player;localSource='playlist';
  if(typeof $!=='undefined'&&$('#musicBtn'))$('#musicBtn').textContent='♫ 随机音乐：'+track.name;
  player.play().catch(()=>{});
}
function startLocalAudio(src,label='upload'){
  if(label==='bgm'||label==='playlist'){startPlaylistAudio();return}
  if(localAudio){localAudio.pause();localAudio=null}
  clearInterval(loop);
  localAudio=new Audio(src);localAudio.loop=true;localAudio.volume=.45;localAudio.play().catch(()=>{});
  localSource=label;if(typeof $!=='undefined'&&$('#musicBtn'))$('#musicBtn').textContent='♫ 本地音乐：开';
}
function stopMusic(){if(localAudio){localAudio.pause();localAudio=null}if(typeof $!=='undefined'&&$('#musicBtn'))$('#musicBtn').textContent='♫ 音乐：关';clearInterval(loop)}
function sfx(kind){const m={draw:[660,.09],discard:[330,.07],peng:[392,.12],gang:[262,.16],win:[784,.3],dice:[520,.05]};const x=m[kind];if(x)beep(x[0],x[1])}
