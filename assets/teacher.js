/* press ` and look busy */
(function(){
  var el=null;
  var paras=[
    'In the sixth chapter the author slows the story down on purpose. Most of the chapter takes place in a single afternoon, and almost nothing happens, but the way the characters talk around the problem tells the reader more than a big event would.',
    'The main character keeps saying that everything is fine. I think the author wants us to notice that people who are actually fine do not usually have to say it that many times. The repetition works like a warning sign.',
    'Another important detail is the weather. It rains through the whole chapter, which could just be setting, but it also matches how stuck everyone feels. Nobody can leave the house and nobody can leave the argument either.',
    'If I had to pick one sentence that sums up the chapter, it would be the last line of the second section, because it is the first time the character admits something is wrong. It is short, but it changes how I read everything before it.',
    'In conclusion, chapter six is slower than the chapters around it, but it is important because it shows what the characters are not saying. I predict that this will come back in the final chapters.'
  ];
  function build(){
    el=document.createElement('div');el.id='teacher';
    var d=new Date();
    el.innerHTML='<div class="page"><div class="nm"><span>Name: ______________________</span><span>Period 4</span></div><div class="nm"><span>English</span><span>'+(d.getMonth()+1)+'/'+d.getDate()+'/'+d.getFullYear()+'</span></div><h1>Reading Response: Chapter 6</h1></div>';
    var pg=el.firstChild;
    paras.forEach(function(t){var p=document.createElement('p');p.textContent=t;pg.appendChild(p)});
    document.body.appendChild(el);
  }
  function toggle(){
    if(el&&el.parentNode){el.remove();document.title=window.__recessTitle||document.title;return}
    window.__recessTitle=document.title;
    if(!el)build();else document.body.appendChild(el);
    document.title='Reading Response - Chapter 6';
    document.dispatchEvent(new CustomEvent('recess:teacher'));
  }
  document.addEventListener('keydown',function(e){
    if(e.code!=='Backquote'||e.metaKey||e.ctrlKey||e.altKey)return;
    var t=e.target;if(t&&t.tagName==='TEXTAREA'&&!(el&&el.parentNode))return;if(t&&t.blur)t.blur();
    e.preventDefault();toggle();
  });
})();
