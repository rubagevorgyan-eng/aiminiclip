/* the swing logo, vector arcade take. Fills every <span class="rlogo"></span> on the page. */
(function(){
  var NS='http://www.w3.org/2000/svg';
  var calm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  function el(t,a,p){var e=document.createElementNS(NS,t);for(var k in a)e.setAttribute(k,a[k]);if(p)p.appendChild(e);return e}
  var all=[];
  function build(host){
    var svg=el('svg',{viewBox:'0 0 172 56',role:'img','aria-label':'Recess'});
    el('path',{d:'M2 5 H50',stroke:'#3a3f55','stroke-width':2,fill:'none'},svg);
    var ghosts=[];
    for(var k=4;k>=0;k--){
      var g=el('g',{opacity:k?(0.1+0.08*(4-k)):1},svg);
      el('path',{d:'M15 5 V40 M33 5 V40',stroke:'#f1ede6','stroke-width':1.2,fill:'none'},g);
      el('path',{d:'M11 41 H37',stroke:'#ff4d2e','stroke-width':2.4,fill:'none'},g);
      var r=el('text',{x:24,y:38,'text-anchor':'middle','font-family':'"Archivo Black","Arial Black",sans-serif','font-size':30,fill:'none',stroke:'#ff4d2e','stroke-width':1.4},g);r.textContent='R';
      ghosts.push({g:g,k:k});
    }
    var t=el('text',{x:50,y:50,'font-family':'"Archivo Black","Arial Black",sans-serif','font-size':31,fill:'none',stroke:'#f1ede6','stroke-width':1.3,'letter-spacing':-.5},svg);t.textContent='ECESS';
    host.appendChild(svg);all.push(ghosts);
  }
  function ang(t,lag){return calm?10:13*Math.sin(((t/1000)-(lag||0))*Math.PI*2/2.4)}
  function frame(t){
    all.forEach(function(gs){gs.forEach(function(o){o.g.setAttribute('transform','rotate('+ang(t,o.k*.06)+' 24 5)')})});
    if(!calm)requestAnimationFrame(frame);
  }
  function go(){var hs=document.querySelectorAll('.rlogo');for(var i=0;i<hs.length;i++)build(hs[i]);if(all.length)requestAnimationFrame(frame)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go();
})();
