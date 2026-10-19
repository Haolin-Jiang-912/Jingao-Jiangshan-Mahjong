const rulesDialog=document.getElementById('rulesDialog');
document.getElementById('rulesBtn').onclick=()=>rulesDialog.showModal();
document.getElementById('closeRules').onclick=()=>rulesDialog.close();
const settingsDialog=document.getElementById('settingsDialog');
document.getElementById('settingsBtn').onclick=()=>settingsDialog.showModal();
document.getElementById('closeSettings').onclick=()=>settingsDialog.close();
const diceDialog=document.getElementById('diceDialog');
document.getElementById('diceBox').onclick=()=>{renderDiceDetails();diceDialog.showModal();};
document.getElementById('closeDice').onclick=()=>diceDialog.close();
document.getElementById('dismissDice').onclick=()=>diceDialog.close();
window.addEventListener?.('resize',()=>{if(G?.h)renderHandControls();});
try{musicOn=localStorage.getItem('jw-music')!=='off';}catch{}
if(!musicOn)stopMusic();
const originalMusicClick=document.getElementById('musicBtn').onclick;
document.getElementById('musicBtn').onclick=()=>{originalMusicClick();try{localStorage.setItem('jw-music',musicOn?'on':'off');}catch{}};
document.addEventListener('keydown',e=>{
  if(e.target.closest('input,textarea,button,a')||rulesDialog.open||settingsDialog.open||diceDialog.open||document.getElementById('modal').classList.contains('show'))return;
  if(e.key==='Escape'){selectedHandIndex=-1;renderHand();}
});
