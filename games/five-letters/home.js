/* Five Letters homepage section. Self-contained: the homepage only needs <section id="five-letters-home"> and this script. */
(function(){
  var root=document.getElementById('five-letters-home');if(!root)return;

  var css=
  '#five-letters-home .flh{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);border:1px solid var(--line);border-top:6px solid #3fd39a;background:var(--panel);overflow:hidden}'+
  '#five-letters-home .art{position:relative;display:grid;place-items:center;min-height:240px;overflow:hidden;'+
    'background:linear-gradient(rgba(63,211,154,.07) 1px,transparent 1px) 0 0/16px 16px,linear-gradient(90deg,rgba(63,211,154,.07) 1px,transparent 1px) 0 0/16px 16px,radial-gradient(circle at 50% 45%,#123a30,#0a1712 75%)}'+
  '#five-letters-home .art::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px 3px)}'+
  '#five-letters-home .art svg{width:46%;max-width:170px;shape-rendering:crispEdges;position:relative;z-index:1;transition:transform .2s cubic-bezier(.3,1.6,.5,1)}'+
  '#five-letters-home .flh:hover .art svg{transform:rotate(-4deg) scale(1.05)}'+
  '#five-letters-home .info{padding:22px 24px;display:flex;flex-direction:column;gap:12px}'+
  '#five-letters-home .tags{display:flex;gap:6px;flex-wrap:wrap}'+
  '#five-letters-home .tags span{font:700 11px var(--mono);letter-spacing:1px;text-transform:uppercase;padding:3px 8px;box-shadow:inset 0 0 0 1px var(--line);color:var(--dim)}'+
  '#five-letters-home .tags .new{background:#3fd39a;color:#0a0a0a;box-shadow:none}'+
  '#five-letters-home h4{margin:0;font:400 clamp(34px,4vw,48px)/.95 var(--disp);letter-spacing:1px;text-transform:uppercase}'+
  '#five-letters-home p{margin:0;color:var(--dim);font-size:15px;max-width:52ch}'+
  '#five-letters-home .today{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:auto}'+
  '#five-letters-home .mini{display:grid;grid-template-columns:repeat(5,10px);gap:2px}'+
  '#five-letters-home .mini i{width:10px;height:10px;background:#2a2d40}'+
  '#five-letters-home .mini i.h{background:#3fd39a}#five-letters-home .mini i.n{background:#ffc94a}#five-letters-home .mini i.e{background:transparent;box-shadow:inset 0 0 0 1px var(--line)}'+
  '#five-letters-home .st{font:700 14px var(--body)}#five-letters-home .st small{display:block;font-weight:400;color:var(--dim)}'+
  '#five-letters-home .btn{margin-left:auto}'+
  '#five-letters-home .btn.fl{background:#3fd39a}#five-letters-home .btn.fl:hover{background:var(--bone)}'+
  '@media(max-width:700px){#five-letters-home .flh{grid-template-columns:1fr}#five-letters-home .art{min-height:180px}#five-letters-home .btn{margin-left:0}}';
  var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

  // pixel logo: four tiles spelling FIVE in the game's colors
  var G={F:['11111','10000','10000','11110','10000','10000','10000'],I:['11111','00100','00100','00100','00100','00100','11111'],V:['10001','10001','10001','10001','01010','01010','00100'],E:['11111','10000','10000','11110','10000','10000','11111']};
  var T=[['F',0,0,'#3fd39a','#8af0c6','#1f8a62','#0b0814'],['I',13,0,'#ffc94a','#ffe39a','#b8861a','#0b0814'],['V',0,13,'#2a2d40','#454a66','#181a27','#f1ede6'],['E',13,13,'#3fd39a','#8af0c6','#1f8a62','#0b0814']];
  var o='';function px(x,y,f){o+='<rect x="'+x+'" y="'+y+'" width="1.02" height="1.02" fill="'+f+'"/>'}
  T.forEach(function(t){var X=t[1],Y=t[2];
    for(var y=0;y<11;y++)for(var x=0;x<11;x++){var edge=x===0||y===0||x===10||y===10;px(X+x,Y+y,edge?'#0b0814':(y===1||x===1)?t[4]:(y===9||x===9)?t[5]:t[3])}
    G[t[0]].forEach(function(r,y){for(var x=0;x<5;x++)if(r[x]==='1')px(X+3+x,Y+2+y,t[6])});
  });

  // today's progress, read from what the game saved
  function get(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}}
  var EPOCH=new Date(2026,0,1),n=new Date();
  var day=Math.round((new Date(n.getFullYear(),n.getMonth(),n.getDate())-EPOCH)/864e5);
  var sv=get('fl-daily'),stats=get('fl-stats')||{},g=sv&&sv.day===day?sv.guesses:[];
  var done=stats.last===day,won=done&&stats.lastRow!=null;
  var status=done?(won?'Solved today in '+(stats.lastRow+1)+'/6':'Missed today’s word'):g.length?g.length+' of 6 guesses used':'Today’s word is waiting';
  var sub=stats.streak?'Streak: '+stats.streak+(stats.streak===1?' day':' days'):'Same word for everyone. Resets at midnight.';
  // mini board shows only hit/near/miss shapes, never letters, so it can't spoil anything
  var cells='';for(var r=0;r<6;r++)for(var c=0;c<5;c++)cells+='<i class="e"></i>';
  var label=done?'Play practice':g.length?'Keep going':'Play today’s word';

  root.innerHTML=
    '<div class="sec"><h3>Daily word</h3><span class="r">new word every midnight</span></div>'+
    '<a class="flh" href="/games/five-letters/" style="text-decoration:none">'+
      '<div class="art"><svg viewBox="0 0 24 24" aria-hidden="true">'+o+'</svg></div>'+
      '<div class="info">'+
        '<div class="tags"><span class="new">New</span><span>Words</span><span>1 player</span><span>Daily</span></div>'+
        '<h4>Five Letters</h4>'+
        '<p>There’s one hidden five-letter word and you get six guesses. After each guess the tiles light up: mint means right letter, right spot; gold means it’s in the word somewhere. Everyone gets the same word each day, and Practice has more whenever you want them.</p>'+
        '<div class="today"><div class="mini" id="flMini" aria-hidden="true">'+cells+'</div>'+
          '<div class="st">'+status+'<small>'+sub+'</small></div>'+
          '<span class="btn fl">'+label+'</span></div>'+
      '</div>'+
    '</a>';

  // color the mini board from today's guesses (colors only)
  var mini=document.getElementById('flMini').children;
  (sv&&sv.day===day&&sv.marks||[]).forEach(function(row,r){for(var c=0;c<5;c++)mini[r*5+c].className=row[c]})
})();
