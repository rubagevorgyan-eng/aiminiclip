/* Five Letters homepage section. Self-contained: the homepage only needs <section id="five-letters-home"> and this script. */
(function(){
  var root=document.getElementById('five-letters-home');if(!root)return;

  var M='#3fd39a',G='#ffc94a',S='#2a2d40',INK='#0b0814';
  var css=
  '#five-letters-home .flx{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);background:var(--panel);border:1px solid var(--line);border-top:6px solid '+M+';overflow:hidden;transition:border-color .15s}'+
  '#five-letters-home .flx:hover{border-color:'+M+'}'+
  /* backdrop: the art itself comes from cover.js */
  '#five-letters-home .flx-art{position:relative;min-height:340px;display:block;overflow:hidden;text-decoration:none;background:#071310}'+
  '#five-letters-home .flx-cover{position:absolute;inset:0;z-index:0}'+
  '#five-letters-home .flx-vsb{position:absolute;right:5%;top:6%;z-index:10;font:400 18px/1 var(--disp);letter-spacing:1px;color:var(--bone);background:#ff4d2e;border:2px solid '+INK+';padding:5px 9px 4px;box-shadow:3px 3px 0 '+INK+';transform:rotate(4deg)}'+
  '#five-letters-home .flx-ftags{position:absolute;left:5%;top:6%;z-index:10;display:flex;gap:6px;flex-wrap:wrap}'+
  '#five-letters-home .flx-ftags span{font:700 11px var(--mono);letter-spacing:1px;text-transform:uppercase;padding:3px 8px;background:rgba(7,8,13,.75);box-shadow:inset 0 0 0 1px var(--line);color:var(--bone)}'+
  '#five-letters-home .flx-ftags .flx-new{background:'+M+';color:#0a0a0a;box-shadow:none}'+
  /* caption */
  '#five-letters-home .flx-cap{display:flex;flex-direction:column;justify-content:center;gap:14px;padding:24px 26px}'+
  '#five-letters-home .flx-cap h2{margin:0;font:400 clamp(40px,4.6vw,60px)/.88 var(--disp);letter-spacing:.5px;text-transform:uppercase}'+
  '#five-letters-home .flx-cap h2 em{font-style:normal;color:'+M+'}'+
  '#five-letters-home .flx-cap .flx-lede{margin:0;font:700 17px/1.35 var(--body);color:var(--bone)}'+
  '#five-letters-home .flx-cap p{margin:0;color:var(--dim);max-width:48ch}'+
  '#five-letters-home .flx-cap p .flx-m{color:'+M+';font-weight:700}#five-letters-home .flx-cap p .flx-g{color:'+G+';font-weight:700}'+
  '#five-letters-home .flx-facts{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}'+
  '#five-letters-home .flx-facts li{font:700 13px var(--body);padding:4px 9px;background:#0a0a0f;border:1px solid var(--line)}'+
  '#five-letters-home .flx-facts b{color:'+M+'}'+
  '#five-letters-home .flx-today{display:flex;align-items:center;gap:12px;padding:10px 12px;background:#0a0a0f;border:1px solid var(--line)}'+
  '#five-letters-home .flx-mini{display:grid;grid-template-columns:repeat(5,9px);gap:2px;flex:none}'+
  '#five-letters-home .flx-mini i{width:9px;height:9px;box-shadow:inset 0 0 0 1px var(--line)}'+
  '#five-letters-home .flx-mini i.flx-h{background:'+M+';box-shadow:none}#five-letters-home .flx-mini i.flx-n{background:'+G+';box-shadow:none}#five-letters-home .flx-mini i.flx-m{background:'+S+';box-shadow:none}'+
  '#five-letters-home .flx-st{font:700 14px var(--body)}#five-letters-home .flx-st small{display:block;font-weight:400;color:var(--dim)}'+
  '#five-letters-home .flx-ctas{display:flex;gap:8px;flex-wrap:wrap}'+
  '#five-letters-home .btn.flx-fl{background:'+M+'}#five-letters-home .btn.flx-fl:hover{background:var(--bone)}'+
  '@media(max-width:1100px){#five-letters-home .flx{grid-template-columns:1fr}#five-letters-home .flx-art{min-height:260px}}'+
  '@media(max-width:520px){#five-letters-home .flx-ctas .btn{flex:1 1 100%}#five-letters-home .flx-vsb{display:none}}';
  var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

  // today's progress, read from what the game saved
  function get(key){try{return JSON.parse(localStorage.getItem(key))}catch(e){return null}}
  var EPOCH=new Date(2026,0,1),n=new Date();
  var day=Math.round((new Date(n.getFullYear(),n.getMonth(),n.getDate())-EPOCH)/864e5);
  var sv=get('fl-daily'),stats=get('fl-stats')||{},g=sv&&sv.day===day?sv.guesses:[];
  var done=stats.last===day,won=done&&stats.lastRow!=null;
  var status=done?(won?'Solved today in '+(stats.lastRow+1)+'/6':'Missed today’s word'):g.length?g.length+' of 6 guesses used':'Today’s word is waiting';
  var sub=stats.streak?'Streak: '+stats.streak+(stats.streak===1?' day':' days'):'Same word for everyone. New one at midnight.';
  var marks=sv&&sv.day===day&&sv.marks||[],cells='';
  for(var r=0;r<6;r++)for(var c=0;c<5;c++)cells+='<i class="'+(marks[r]?'flx-'+marks[r][c]:'')+'"></i>';
  var label=done?'Play Endless':g.length?'Keep going':'Play today’s word',href='/games/five-letters/'+(done?'?mode=endless':'');

  root.innerHTML=
    '<div class="sec"><h3>New: Five Letters</h3><span class="r">one word, six tries, new every midnight</span></div>'+
    '<section class="flx">'+
      '<a class="flx-art" href="'+href+'" aria-label="Play Five Letters">'+
        '<span class="flx-cover" data-five-letters-cover></span>'+
        '<span class="flx-ftags"><span class="flx-new">New</span><span>Words</span><span>Daily + Endless</span></span>'+
        '<span class="flx-vsb">VS ONLINE</span>'+
      '</a>'+
      '<div class="flx-cap">'+
        '<h2><em>Five</em> Letters</h2>'+
        '<p class="flx-lede">One hidden word. Six guesses. Can you crack it?</p>'+
        '<p>Every guess lights up the tiles: <span class="flx-m">mint</span> is the right letter in the right spot, <span class="flx-g">gold</span> is in the word but somewhere else. Solve the Daily with everyone, push your high score in Endless, or open a VS lobby and race your friends through the same words.</p>'+
        '<ul class="flx-facts"><li><b>787</b> hidden words</li><li>Daily <b>streaks</b></li><li>Endless <b>high scores</b></li><li>VS lobbies up to <b>8</b></li></ul>'+
        '<div class="flx-today"><div class="flx-mini" aria-hidden="true">'+cells+'</div><div class="flx-st">'+status+'<small>'+sub+'</small></div></div>'+
        '<div class="flx-ctas"><a class="btn flx-fl" href="'+href+'">'+label+'</a><a class="btn alt" href="/games/five-letters/?mode=vs">Host a VS lobby</a></div>'+
      '</div>'+
    '</section>';

  // flip the tiles in when the section scrolls into view
  // the cover art lives in cover.js so every Five Letters card on the site looks the same
  if(window.FiveLettersCover)window.FiveLettersCover.scan(root);
  else{var cs=document.createElement('script');cs.src='/games/five-letters/cover.js';document.head.appendChild(cs)}
})();
