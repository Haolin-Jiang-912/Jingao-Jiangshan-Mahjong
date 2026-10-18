const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');
fs.mkdirSync(out,{recursive:true});
// Explicit allowlist keeps source photos, tests and credentials off the website.
const files=['index.html','game.html','style.css','lobby.js','experience.js','engine.js','ui.js','net.js','app.js',
  'campus-cover.png','avatar-chaochao.png','avatar-hanhan.png','avatar-linlin.png','avatar-zhengzheng.png',
  'sprite-jiejie.png','bgm-1.mp3','bgm-2.mp3','bgm-3.mp3','school-desks.png'];
for(const name of files)if(fs.existsSync(path.join(root,name)))fs.copyFileSync(path.join(root,name),path.join(out,name));
console.log('Game assets prepared in dist/');
