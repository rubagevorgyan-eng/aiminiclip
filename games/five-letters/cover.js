/* Five Letters cover art: a game being solved on a tilted board, the tile wordmark, and a glowing keyboard.
   Fills any element with [data-five-letters-cover], and upgrades the Five Letters lineup card (.s.fl) and any copy of it.
   Pure markup + CSS once drawn, so cloned copies keep working. All class names start with flc- so nothing collides. */
(function(){
  if(window.FiveLettersCover)return;
  var M='#3fd39a',G='#ffc94a',S='#2a2d40',INK='#0b0814',BONE='#f1ede6';

  var css=
  '.flc-host{position:relative;overflow:hidden}'+
  '.flc{position:absolute;inset:0;overflow:hidden;container-type:size;background:radial-gradient(ellipse 80% 70% at 30% 45%,#1c5a47 0,#0e3329 40%,#071310 80%),#071310;font-family:"Anton",Impact,sans-serif}'+
  '.flc::after{content:"";position:absolute;inset:0;z-index:9;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.22) 0 1px,transparent 1px 3px),radial-gradient(ellipse at 50% 50%,transparent 55%,rgba(0,0,0,.55))}'+
  /* light rays behind the wordmark */
  '.flc-rays{position:absolute;left:30%;top:46%;width:150cqmax;height:150cqmax;transform:translate(-50%,-50%);background:repeating-conic-gradient(from 0deg,rgba(63,211,154,.14) 0 4deg,transparent 4deg 14deg);-webkit-mask:radial-gradient(closest-side,#000 15%,transparent 70%);mask:radial-gradient(closest-side,#000 15%,transparent 70%);animation:flcSpin 60s linear infinite}'+
  '@keyframes flcSpin{to{transform:translate(-50%,-50%) rotate(360deg)}}'+
  /* tile floor */
  '.flc-floor{position:absolute;left:-40%;right:-40%;bottom:-4%;height:42%;transform:perspective(40cqh) rotateX(64deg);transform-origin:50% 100%;'+
    'background:linear-gradient(90deg,rgba(63,211,154,.5) 2px,transparent 2px) 0 0/7cqw 7cqw,linear-gradient(rgba(63,211,154,.5) 2px,transparent 2px) 0 0/7cqw 7cqw;'+
    '-webkit-mask:linear-gradient(transparent,#000 75%);mask:linear-gradient(transparent,#000 75%);animation:flcFloor 2.6s linear infinite}'+
  '@keyframes flcFloor{to{background-position:0 7cqw,0 7cqw}}'+
  /* the board, tilted, solving a word on loop */
  '.flc-board{position:absolute;right:7cqw;top:50%;display:grid;grid-template-columns:repeat(5,1fr);gap:.9cqmin;width:min(29cqw,56cqh);transform:translateY(-50%) perspective(90cqw) rotateY(-24deg) rotateX(8deg);filter:drop-shadow(1.2cqmin 1.6cqmin 0 rgba(0,0,0,.55))}'+
  '.flc-board i{aspect-ratio:1;display:grid;place-items:center;font-style:normal;font-size:min(3.6cqw,4.8cqh);line-height:1;color:'+BONE+';box-shadow:inset 0 0 0 .4cqmin #3d5a50;background:rgba(7,19,16,.6)}'+
  '.flc-board i.flc-r{animation:flcReveal 10s infinite both;animation-delay:var(--d)}'+
  '@keyframes flcReveal{0%{transform:rotateX(90deg);background:var(--c);color:var(--k);box-shadow:none}'+
    '5%,78%{transform:none;background:var(--c);color:var(--k);box-shadow:inset .5cqmin .5cqmin 0 rgba(255,255,255,.3),inset -.5cqmin -.5cqmin 0 rgba(0,0,0,.25)}'+
    '82%,100%{transform:none;background:rgba(7,19,16,.6);color:transparent;box-shadow:inset 0 0 0 .4cqmin #3d5a50}}'+
  /* wordmark */
  '.flc-logo{position:absolute;left:8cqw;top:50%;transform:translateY(-50%) rotate(-3deg);display:grid;gap:1.6cqmin;justify-items:start;filter:drop-shadow(0 1.4cqmin 0 #000) drop-shadow(0 0 4cqmin rgba(63,211,154,.35));z-index:3}'+
  '.flc-w{display:flex;gap:1.1cqmin}'+
  '.flc-t{--s:min(10.5cqw,19cqh);width:var(--s);height:var(--s);display:grid;place-items:center;background:var(--c);border:max(2px,.55cqmin) solid '+INK+';'+
    'box-shadow:inset .8cqmin .8cqmin 0 rgba(255,255,255,.38),inset -.8cqmin -.8cqmin 0 rgba(0,0,0,.28);animation:flcIn .55s cubic-bezier(.3,1.6,.5,1) both,flcHop 6s ease-in-out infinite;animation-delay:calc(var(--i)*90ms),calc(1.2s + var(--i)*120ms)}'+
  '.flc-w.flc-sm .flc-t{--s:min(5.9cqw,10.6cqh);border-width:max(2px,.4cqmin)}'+
  '.flc svg.flc-gl{width:56%!important;height:auto;display:block;shape-rendering:crispEdges}'+
  '@keyframes flcIn{from{transform:rotateX(90deg) translateY(-30%);opacity:0}}'+
  '@keyframes flcHop{0%,86%,100%{transform:none}90%{transform:translateY(-22%)}94%{transform:translateY(4%)}}'+
  '.flc-tag{margin-top:2.4cqmin;font:700 min(1.9cqw,3.4cqh)/1 "Silkscreen","JetBrains Mono",monospace;letter-spacing:.2em;color:'+INK+';background:'+G+';padding:.9cqmin 1.4cqmin;border:max(2px,.4cqmin) solid '+INK+';box-shadow:.7cqmin .7cqmin 0 '+INK+'}'+
  /* keyboard glowing under everything */
  '.flc-kb{position:absolute;left:50%;bottom:4cqh;transform:translateX(-50%) perspective(60cqw) rotateX(38deg);display:grid;gap:.7cqmin;opacity:.92;z-index:2}'+
  '.flc-kr{display:flex;justify-content:center;gap:.7cqmin}'+
  '.flc-kr b{width:min(3.4cqw,5.4cqh);height:min(3.9cqw,6.2cqh);display:grid;place-items:center;font:700 min(1.5cqw,2.4cqh) "Archivo",system-ui,sans-serif;color:#9aa0bb;background:#2b3046;border-radius:.4cqmin;box-shadow:0 .5cqmin 0 #12141f}'+
  '.flc-kr b.flc-h{background:'+M+';color:'+INK+';box-shadow:0 .5cqmin 0 #1f8a62,0 0 2cqmin rgba(63,211,154,.6)}'+
  '.flc-kr b.flc-n{background:'+G+';color:'+INK+';box-shadow:0 .5cqmin 0 #b8861a}'+
  '.flc-kr b.flc-m{background:#151826;color:#4b5068}'+
  /* sparks */
  '.flc-spark{position:absolute;width:1cqmin;height:1cqmin;background:'+G+';box-shadow:0 0 1.5cqmin '+G+';animation:flcTw 2.4s steps(2) infinite;z-index:4}'+
  '@keyframes flcTw{50%{opacity:.15;transform:scale(.5)}}'+
  '@container (max-aspect-ratio: 1/1){.flc-board{opacity:.35;right:-4cqw}.flc-logo{left:6cqw}}'+
  '@media(prefers-reduced-motion:reduce){.flc-rays,.flc-floor,.flc-t,.flc-spark{animation:none}.flc-board i.flc-r{animation:none;background:var(--c);color:var(--k)}}';
  var st=document.createElement('style');st.id='five-letters-cover-css';st.textContent=css;(document.head||document.documentElement).appendChild(st);

  // 5x7 pixel letters for the wordmark
  var GL={F:['11111','10000','10000','11110','10000','10000','10000'],I:['11111','00100','00100','00100','00100','00100','11111'],
    V:['10001','10001','10001','10001','01010','01010','00100'],E:['11111','10000','10000','11110','10000','10000','11111'],
    L:['10000','10000','10000','10000','10000','10000','11111'],T:['11111','00100','00100','00100','00100','00100','00100'],
    R:['11110','10001','10001','11110','10100','10010','10001'],S:['01111','10000','10000','01110','00001','00001','11110']};
  function glyph(ch,ink){var o='';GL[ch].forEach(function(r,y){for(var x=0;x<5;x++)if(r[x]==='1')o+='<rect x="'+x+'" y="'+y+'" width="1.02" height="1.02" fill="'+ink+'"/>'});
    return '<svg class="flc-gl" viewBox="0 0 5 7" aria-hidden="true">'+o+'</svg>'}

  // the same scoring the game uses
  function score(g,a){var res=['m','m','m','m','m'],left={},i;
    for(i=0;i<5;i++){if(g[i]===a[i])res[i]='h';else left[a[i]]=(left[a[i]]||0)+1}
    for(i=0;i<5;i++)if(res[i]!=='h'&&left[g[i]]){res[i]='n';left[g[i]]--}return res}
  var ANS='WORDS',GUESSES=['CRANE','STORE','SWORD','WORDS'];
  var COL={h:[M,INK],n:[G,INK],m:[S,BONE]};

  function build(){
    var k=0;
    function row(word,cols,sm){return '<div class="flc-w'+(sm?' flc-sm':'')+'">'+word.split('').map(function(ch,i){var c=cols[i];
      return '<span class="flc-t" style="--c:'+c+';--i:'+(k++)+'">'+glyph(ch,c===S?BONE:INK)+'</span>'}).join('')+'</div>'}
    var logo='<div class="flc-logo">'+row('FIVE',[M,G,S,M])+row('LETTERS',[M,M,M,M,M,M,M],1)+'<span class="flc-tag">6 TRIES. 1 WORD.</span></div>';
    var board='',best={};
    for(var r=0;r<6;r++)for(var c=0;c<5;c++){
      var g=GUESSES[r];
      if(g){var sc=score(g,ANS)[c],cc=COL[sc];
        if(!best[g[c]]||'mnh'.indexOf(sc)>'mnh'.indexOf(best[g[c]]))best[g[c]]=sc;
        board+='<i class="flc-r" style="--c:'+cc[0]+';--k:'+cc[1]+';--d:'+(r*1.1+c*.12).toFixed(2)+'s">'+g[c]+'</i>'}
      else board+='<i></i>';
    }
    var kb='<div class="flc-kb">'+['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'].map(function(rw){return '<div class="flc-kr">'+rw.split('').map(function(ch){
      return '<b class="'+(best[ch]?'flc-'+best[ch]:'')+'">'+ch+'</b>'}).join('')+'</div>'}).join('')+'</div>';
    var sparks=[[44,18,0],[60,72,.8],[20,80,1.6],[88,14,.4],[52,40,1.2]].map(function(p){return '<span class="flc-spark" style="left:'+p[0]+'%;top:'+p[1]+'%;animation-delay:'+p[2]+'s"></span>'}).join('');
    return '<div class="flc" aria-hidden="true"><span class="flc-rays"></span><span class="flc-floor"></span>'+kb+'<div class="flc-board">'+board+'</div>'+logo+sparks+'</div>';
  }
  var HTML=build();
  function fill(el){if(!el||el.querySelector('.flc'))return;el.classList.add('flc-host');el.innerHTML=HTML}
  var SEL='[data-five-letters-cover],.g .s.fl,.hart .s.fl';
  function scan(root){root=root||document;if(root.matches&&root.matches(SEL))fill(root);if(root.querySelectorAll)root.querySelectorAll(SEL).forEach(fill)}
  window.FiveLettersCover={fill:fill,scan:scan};
  function start(){scan();
    if('MutationObserver' in window)new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeType===1)scan(n)})})}).observe(document.body,{childList:true,subtree:true});
  }
  if(document.body)start();else document.addEventListener('DOMContentLoaded',start);
})();
