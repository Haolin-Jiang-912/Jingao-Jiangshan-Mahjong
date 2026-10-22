const rulesDialog=document.getElementById('rulesDialog');
document.getElementById('rulesBtn').onclick=()=>rulesDialog.showModal();
document.getElementById('closeRules').onclick=()=>rulesDialog.close();
const settingsDialog=document.getElementById('settingsDialog');
document.getElementById('settingsBtn').onclick=()=>settingsDialog.showModal();
document.getElementById('closeSettings').onclick=()=>settingsDialog.close();
const diceDialog=document.getElementById('diceDialog');
const discardsDialog=document.getElementById('discardsDialog');
for(let q=0;q<4;q++)document.getElementById('discards-'+q).onclick=()=>{inspectedDiscardSeat=q;renderDiscardsDetail();discardsDialog.showModal();};
document.getElementById('closeDiscards').onclick=()=>discardsDialog.close();
document.getElementById('dismissDiscards').onclick=()=>discardsDialog.close();
document.getElementById('diceBox').onclick=()=>{renderDiceDetails();diceDialog.showModal();};
document.getElementById('closeDice').onclick=()=>diceDialog.close();
document.getElementById('dismissDice').onclick=()=>diceDialog.close();
window.addEventListener?.('resize',()=>{if(G?.h){renderHandControls();layoutDiscards();}});
// Reserve only the space the actual hand needs; a header plus dock must never
// squeeze the entire desk into a small island on a short landscape screen.
if(typeof ResizeObserver==='function'){
  const dock=document.querySelector('.hand-area'),scene=document.querySelector('.classroom');
  new ResizeObserver(()=>{scene.style.setProperty('--hand-space',Math.ceil(dock.getBoundingClientRect().height)+'px');layoutDiscards();}).observe(dock);
  new ResizeObserver(()=>layoutDiscards()).observe(document.querySelector('.center-board'));
}
try{musicOn=localStorage.getItem('jw-music')!=='off';}catch{}
if(!musicOn)stopMusic();
const originalMusicClick=document.getElementById('musicBtn').onclick;
document.getElementById('musicBtn').onclick=()=>{originalMusicClick();try{localStorage.setItem('jw-music',musicOn?'on':'off');}catch{}};
document.addEventListener('keydown',e=>{
  if(e.target.closest('input,textarea,button,a')||rulesDialog.open||settingsDialog.open||diceDialog.open||discardsDialog.open||document.getElementById('modal').classList.contains('show'))return;
  if(e.key==='Escape'){selectedHandIndex=-1;renderHand();}
});
