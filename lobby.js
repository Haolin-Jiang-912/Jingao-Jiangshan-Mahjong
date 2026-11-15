const byId=id=>document.getElementById(id);
const nameInput=byId('playerName'),roomInput=byId('roomCode');
try{nameInput.value=localStorage.getItem('jw-name')||'';}catch{}
const mode=()=>document.querySelector('input[name="mode"]:checked').value;
function remember(){try{localStorage.setItem('jw-name',nameInput.value.trim());}catch{}}
function go(role,room){
  remember();const q=new URLSearchParams({mode:mode(),role,room,name:nameInput.value.trim()||'玩家'});
  location.href='game.html?'+q;
}
byId('createRoom').onclick=()=>{
  const bytes=crypto.getRandomValues(new Uint8Array(6)),alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  go('host',Array.from(bytes,b=>alphabet[b%alphabet.length]).join(''));
};
byId('joinForm').onsubmit=e=>{
  e.preventDefault();const code=roomInput.value.trim().toUpperCase();
  if(!/^[A-Z0-9]{4,8}$/.test(code)){byId('lobbyError').textContent='请输入 4–8 位字母或数字房间号';roomInput.setAttribute('aria-invalid','true');roomInput.focus();return;}
  go('client',code);
};
roomInput.oninput=()=>{byId('lobbyError').textContent='';roomInput.removeAttribute('aria-invalid');};
function setTab(solo){
  byId('friendsPanel').hidden=solo;byId('soloPanel').hidden=!solo;
  byId('friendsTab').setAttribute('aria-selected',String(!solo));byId('soloTab').setAttribute('aria-selected',String(solo));
}
byId('friendsTab').onclick=()=>setTab(false);byId('soloTab').onclick=()=>setTab(true);
for(const id of ['friendsTab','soloTab'])byId(id).onkeydown=e=>{
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const solo=id==='friendsTab';setTab(solo);byId(solo?'soloTab':'friendsTab').focus();}
};
for(const radio of document.querySelectorAll('input[name="mode"]'))radio.onchange=()=>byId('soloStart').href='game.html?mode='+mode();
