/* shared bits for every page: game list, last played, my recess */
window.Recess=(function(){
  var GAMES=[
    {slug:'needle-drop',title:'Needle Drop',cat:'Music',color:'tangerine',blurb:'Name the song from half a second of it'}
  ];
  function get(k){try{return JSON.parse(localStorage.getItem(k)||'[]')}catch(e){return[]}}
  function put(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
  function bySlug(s){for(var i=0;i<GAMES.length;i++)if(GAMES[i].slug===s)return GAMES[i];return null}
  function played(slug){var r=get('recess-recent').filter(function(s){return s!==slug});r.unshift(slug);put('recess-recent',r.slice(0,6))}
  function isFav(slug){return get('recess-mine').indexOf(slug)>-1}
  function toggleFav(slug){var m=get('recess-mine');var i=m.indexOf(slug);if(i>-1)m.splice(i,1);else m.unshift(slug);put('recess-mine',m);return i<0}
  function link(g){var a=document.createElement('a');a.href='/games/'+g.slug+'/';a.textContent=g.title;return a}
  function list(el,slugs,empty){
    el.innerHTML='';var gs=slugs.map(bySlug).filter(Boolean);
    if(!gs.length){var s=document.createElement('span');s.className='empty';s.textContent=empty;el.appendChild(s);return}
    gs.forEach(function(g){var a=link(g);a.className='mini c-'+g.color;el.appendChild(a)});
  }
  // $20 Anime Battle, added on its own line so other games' list edits don't collide with it
  GAMES.push({slug:'best-anime-character',title:'$20 Anime Battle',cat:'Anime',color:'tangerine',blurb:'Two players, $20 each: bid on 1,300+ anime, manga and manhwa characters and build the strongest team'});
  function footer(){
    var f=document.getElementById('allgames');if(!f)return;
    GAMES.slice().sort(function(a,b){return a.title.localeCompare(b.title)}).forEach(function(g){f.appendChild(link(g))});
  }
  document.addEventListener('DOMContentLoaded',footer);
  return {GAMES:GAMES,played:played,isFav:isFav,toggleFav:toggleFav,recent:function(){return get('recess-recent')},mine:function(){return get('recess-mine')},list:list};
})();
