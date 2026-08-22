/* 渲染层：牌面 / 座位 / 弃牌区 / 动作条 / 弹窗 */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const NAMES=['林林','超超','含含','政政'];
const CN='一二三四五六七八九';
let G=null;
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
function face(t,cls='tile'){return `<span class="${cls}">${innerFace(t)}</span>`}
function backTile(){return '<span class="tile back"></span>'}
function renderHand(){
  const P=G.h.P[0];
  P.hand.sort((a,b)=>valOf(a)-valOf(b));
  $('#hand').innerHTML=P.hand.map((t,i)=>`<button class="tile ${t===G.h.wealth?'wealth':''}" data-i="${i}">${innerFace(t)}</button>`).join('');
  $('#myMelds').innerHTML=P.melds.map(m=>`<span class="meld ${m.type}">${m.tiles.map(t=>face(t,'mtile')).join('')}</span>`).join('');
  $('#flowerTiles').innerHTML=P.flowers.map(f=>face(f,'ftile')).join('');
  $('#flowers').textContent='花 '+P.flowers.length;
}
function renderOpp(q){
  const P=G.h.P[q],el=$('#opp-'+q);
  el.querySelector('.backs').innerHTML=backTile().repeat(P.hand.length);
  el.querySelector('.omelds').innerHTML=P.melds.map(m=>`<span class="meld ${m.type}">${m.tiles.map(t=>face(t,'mtile s')).join('')}</span>`).join('');
  el.querySelector('.oflowers').textContent=P.flowers.length?'花'+P.flowers.length:'';
  el.classList.toggle('active',G.h.turn===q&&!G.h.over);
}
function renderDiscards(){
  for(let q=0;q<4;q++){$('#discards-'+q).innerHTML=G.h.discards[q].map(t=>face(t,'dtile')).join('')}
}
function renderInfo(){
  $('#wealthBox').innerHTML=G.h.ind?`<small>翻牌</small>${face(G.h.ind,'mtile s')}<small>财神</small>${face(G.h.wealth,'mtile s gold')}`:'<small>掷骰定庄中…</small>';
  $('#wallCount').textContent='牌墙 '+G.h.wall.length;
  $('#turnLabel').textContent=G.h.over?'本盘结束':NAMES[G.h.turn]+' 行牌';
  $('#handNo').textContent=(G.mode==='ju'?'局麻':'第 '+(G.hand+1)+'/8 盘');
}
function renderScores(){
  for(let q=0;q<4;q++){
    const el=q===0?$('#myScore'):$(`.oscore[data-p="${q}"]`);
    if(!el)continue;
    el.innerHTML=`${NAMES[q]} <b>${G.scores[q]}</b>${G.mode==='ju'&&G.specials[q]?'<i>+'+G.specials[q]+'★</i>':''}`;
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
/* 像素音效 + 背景音乐（默认 bgm.mp3，也可上传本地 MP3 或切回像素电台） */
let audio,loop,musicOn=true,localAudio=null,localSource='bgm';
const TRACKS=[
  {name:'像素晴天',notes:[523,659,784,880,784,659,587,659,698,784,1046,784],beat:220},
  {name:'课间小调',notes:[392,440,494,523,494,440,392,440,494,523,587,523],beat:260},
  {name:'麻雀圆舞曲',notes:[440,494,523,494,440,392,440,523,587,523,494,440],beat:240}
];let trackIdx=0;
function beep(f,d=.18){if(!audio||!musicOn||localAudio)return;const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.value=f;g.gain.setValueAtTime(.032,audio.currentTime);g.gain.exponentialRampToTimeAtTime(.001,audio.currentTime+d);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+d)}
function music(){if(localAudio)return;audio??=new AudioContext();audio.resume();clearInterval(loop);const t=TRACKS[trackIdx];let i=0;loop=setInterval(()=>{beep(t.notes[i++%t.notes.length],t.beat/1200)},t.beat)}
function nextTrack(){trackIdx=(trackIdx+1)%TRACKS.length;if(musicOn&&!localAudio){music();note('🎵 '+TRACKS[trackIdx].name+'（像素电台，上传本地 MP3 可听流行乐）')}}
function startLocalAudio(src,label='bgm'){
  if(localAudio){localAudio.pause();localAudio=null}
  localAudio=new Audio(src);localAudio.loop=true;localAudio.volume=.45;localAudio.play().catch(()=>{});
  localSource=label;clearInterval(loop);if(typeof $!=='undefined'&&$('#musicBtn'))$('#musicBtn').textContent='♫ '+(label==='bgm'?'背景音乐':'本地音乐')+'：开';
}
function stopMusic(){if(localAudio){localAudio.pause();localAudio=null}if(typeof $!=='undefined'&&$('#musicBtn'))$('#musicBtn').textContent='♫ 音乐：关';clearInterval(loop)}
function sfx(kind){const m={draw:[660,.09],discard:[330,.07],peng:[392,.12],gang:[262,.16],win:[784,.3],dice:[520,.05]};const x=m[kind];if(x)beep(x[0],x[1])}
