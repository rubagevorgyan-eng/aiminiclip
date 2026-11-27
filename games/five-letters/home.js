/* Five Letters homepage section. Self-contained: the homepage only needs <section id="five-letters-home"> and this script. */
(function(){
  var root=document.getElementById('five-letters-home');if(!root)return;

  var M='#3fd39a',G='#ffc94a',S='#2a2d40',INK='#0b0814';
  var css=
  '#five-letters-home .flx{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);background:var(--panel);border:1px solid var(--line);border-top:6px solid '+M+';overflow:hidden;transition:border-color .15s}'+
  '#five-letters-home .flx:hover{border-color:'+M+'}'+
  /* backdrop */
  '#five-letters-home .flx-art{position:relative;min-height:300px;display:grid;place-items:center;overflow:hidden;text-decoration:none;perspective:600px;'+
    'background:radial-gradient(ellipse at 50% 38%,#17503f 0,#0c2a22 38%,#070f0d 78%)}'+
  '#five-letters-home .flx-art::after{content:"";position:absolute;inset:0;z-index:4;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.2) 0 1px,transparent 1px 3px)}'+
  '#five-letters-home .flx-floor{position:absolute;left:-40%;right:-40%;bottom:-6%;height:52%;transform:perspective(260px) rotateX(62deg);transform-origin:50% 100%;'+
    'background:linear-gradient(90deg,rgba(63,211,154,.45) 2px,transparent 2px) 0 0/44px 44px,linear-gradient(rgba(63,211,154,.45) 2px,transparent 2px) 0 0/44px 44px;'+
    '-webkit-mask:linear-gradient(transparent,#000 70%);mask:linear-gradient(transparent,#000 70%);animation:flxFloor 2.4s linear infinite}'+
  '@keyframes flxFloor{to{background-position:0 44px,0 44px}}'+
  '#five-letters-home .flx-glow{position:absolute;left:50%;top:44%;width:70%;aspect-ratio:2/1;transform:translate(-50%,-50%);background:radial-gradient(closest-side,rgba(63,211,154,.35),transparent);filter:blur(6px);animation:flxPulse 3s ease-in-out infinite alternate}'+
  '@keyframes flxPulse{to{opacity:.55;transform:translate(-50%,-50%) scale(1.08)}}'+
  '#five-letters-home .flx-drift{position:absolute;inset:0;overflow:hidden}'+
  '#five-letters-home .flx-drift i{position:absolute;bottom:-60px;display:grid;place-items:center;width:34px;height:34px;font:400 20px var(--disp);font-style:normal;color:rgba(63,211,154,.55);box-shadow:inset 0 0 0 2px rgba(63,211,154,.3);animation:flxUp linear infinite}'+
  '@keyframes flxUp{from{transform:translateY(0) rotate(-8deg);opacity:0}15%{opacity:1}to{transform:translateY(-380px) rotate(10deg);opacity:0}}'+
  /* tile wordmark */
  '#five-letters-home .flx-logo{position:relative;z-index:2;display:grid;justify-items:center;gap:10px;margin-top:-14px;filter:drop-shadow(0 7px 0 #000)}'+
  '#five-letters-home .flx-wr{display:flex;gap:6px}'+
  '#five-letters-home .flx-tl{--s:clamp(46px,5.4vw,68px);width:var(--s);height:var(--s);display:grid;place-items:center;background:var(--c);border:3px solid '+INK+';'+
    'box-shadow:inset 4px 4px 0 rgba(255,255,255,.35),inset -4px -4px 0 rgba(0,0,0,.28);transform:rotateX(90deg)}'+
  '#five-letters-home .flx-wr.flx-sm .flx-tl{--s:clamp(30px,3.3vw,42px);border-width:2px;box-shadow:inset 3px 3px 0 rgba(255,255,255,.35),inset -3px -3px 0 rgba(0,0,0,.28)}'+
  '#five-letters-home .flx-tl svg{width:56%;height:auto;shape-rendering:crispEdges}'+
  '#five-letters-home .flx-go .flx-tl{animation:flxFlip .5s cubic-bezier(.3,1.5,.5,1) forwards;animation-delay:calc(var(--i)*90ms)}'+
  '@keyframes flxFlip{from{transform:rotateX(90deg)}to{transform:none}}'+
  '#five-letters-home .flx:hover .flx-go .flx-tl{animation:flxHop .45s ease both;animation-delay:calc(var(--i)*45ms)}'+
  '@keyframes flxHop{0%{transform:none}40%{transform:translateY(-12px)}70%{transform:translateY(2px)}100%{transform:none}}'+
  '#five-letters-home .flx-chip{position:absolute;left:5%;bottom:7%;z-index:3;font:700 11px "Silkscreen",var(--mono),monospace;letter-spacing:1px;color:'+INK+';background:'+G+';border:2px solid '+INK+';padding:4px 8px;box-shadow:3px 3px 0 '+INK+'}'+
  '#five-letters-home .flx-vsb{position:absolute;right:5%;bottom:7%;z-index:3;font:400 18px/1 var(--disp);letter-spacing:1px;color:var(--bone);background:#ff4d2e;border:2px solid '+INK+';padding:5px 9px 4px;box-shadow:3px 3px 0 '+INK+';transform:rotate(-4deg)}'+
  '#five-letters-home .flx-ftags{position:absolute;left:5%;top:6%;z-index:3;display:flex;gap:6px;flex-wrap:wrap}'+
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
  '@media(max-width:520px){#five-letters-home .flx-wr{gap:4px}#five-letters-home .flx-wr.flx-sm .flx-tl{--s:30px}#five-letters-home .flx-tl{--s:50px}#five-letters-home .flx-ctas .btn{flex:1 1 100%}}'+
  '@media(prefers-reduced-motion:reduce){#five-letters-home .flx-floor,#five-letters-home .flx-glow,#five-letters-home .flx-drift i{animation:none}#five-letters-home .flx-drift{display:none}#five-letters-home .flx-tl{transform:none}#five-letters-home .flx-go .flx-tl,#five-letters-home .flx:hover .flx-go .flx-tl{animation:none}}';
  var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

  // 5x7 pixel letters for the tile wordmark
  var GL={F:['11111','10000','10000','11110','10000','10000','10000'],I:['11111','00100','00100','00100','00100','00100','11111'],
    V:['10001','10001','10001','10001','01010','01010','00100'],E:['11111','10000','10000','11110','10000','10000','11111'],
    L:['10000','10000','10000','10000','10000','10000','11111'],T:['11111','00100','00100','00100','00100','00100','00100'],
    R:['11110','10001','10001','11110','10100','10010','10001'],S:['01111','10000','10000','01110','00001','00001','11110']};
  function glyph(ch,ink){var o='';GL[ch].forEach(function(r,y){for(var x=0;x<5;x++)if(r[x]==='1')o+='<rect x="'+x+'" y="'+y+'" width="1.02" height="1.02" fill="'+ink+'"/>'});
    return '<svg viewBox="0 0 5 7" aria-hidden="true">'+o+'</svg>'}
  var k=0;
  function row(word,cols,cls){return '<div class="flx-wr '+(cls?'flx-'+cls:'')+'">'+word.split('').map(function(ch,i){var c=cols[i];
    return '<span class="flx-tl" style="--c:'+c+';--i:'+(k++)+'">'+glyph(ch,c===S?'#f1ede6':INK)+'</span>'}).join('')+'</div>'}
  // top row is a guess in progress, bottom row is solved
  var logo='<div class="flx-logo" id="flxLogo">'+row('FIVE',[M,G,S,M])+row('LETTERS',[M,M,M,M,M,M,M],'sm')+'</div>';

  var drift='',letters='QWERTYUPASDFGHJKLZXCVBNM';
  for(var d=0;d<12;d++)drift+='<i style="left:'+(4+d*8+(d%3)*2)+'%;animation-duration:'+(7+(d*37%6))+'s;animation-delay:-'+(d*1.3%8).toFixed(1)+'s">'+letters[(d*7)%letters.length]+'</i>';

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
        '<span class="flx-glow"></span><span class="flx-floor"></span><span class="flx-drift" aria-hidden="true">'+drift+'</span>'+
        '<span class="flx-ftags"><span class="flx-new">New</span><span>Words</span><span>Daily + Endless</span></span>'+
        logo+
        '<span class="flx-chip">6 TRIES. 1 WORD.</span><span class="flx-vsb">VS ONLINE</span>'+
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
  var lg=document.getElementById('flxLogo');
  if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){if(es[0].isIntersecting){lg.classList.add('flx-go');io.disconnect()}},{threshold:.35});io.observe(lg)}
  else lg.classList.add('flx-go');
})();
