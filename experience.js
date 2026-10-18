const rulesDialog=document.getElementById('rulesDialog');
document.getElementById('rulesBtn').onclick=()=>rulesDialog.showModal();
document.getElementById('closeRules').onclick=()=>rulesDialog.close();
try{musicOn=localStorage.getItem('jw-music')!=='off';}catch{}
if(!musicOn)stopMusic();
const originalMusicClick=document.getElementById('musicBtn').onclick;
document.getElementById('musicBtn').onclick=()=>{originalMusicClick();try{localStorage.setItem('jw-music',musicOn?'on':'off');}catch{}};
document.addEventListener('keydown',e=>{
  if(e.target.closest('input,textarea,button,a')||rulesDialog.open||document.getElementById('modal').classList.contains('show'))return;
  if(e.key==='Enter'&&canChooseTile()){e.preventDefault();document.getElementById('discardBtn').click();}
  if(e.key==='Escape'){selectedHandIndex=-1;renderHand();}
});
