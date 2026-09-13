import { registerPanel, setPanel, closePanels } from './panels.js';
import { icon } from './icons.js';
import { TOPICS, Friendships } from './conversations.js';

const text = (tag, content, className) => {
  const el=document.createElement(tag); el.textContent=content;
  if (className) el.className=className; return el;
};

/** DOM menus are keyboard accessible and do no work while the player is exploring. */
export class PlayerHud {
  constructor(actions) {
    this.actions=actions;
    let storage; try { storage=localStorage; } catch { /* Private browsing. */ }
    this.friendships=new Friendships(storage);
    this.root=document.createElement('section'); this.root.id='player-hud'; this.root.hidden=true;
    this.root.setAttribute('aria-label','Character controls');
    this.root.innerHTML=`
      <div class="traveller-card">
        <span class="traveller-seal" aria-hidden="true">${icon('compass')}</span>
        <div><span class="player-eyebrow">Your story in the valley</span><strong>The Traveller</strong><span id="player-activity">Exploring · Ranger</span></div>
        <button type="button" id="player-outfit" aria-label="Choose character" title="Choose character">${icon('person')}</button>
      </div>
      <div class="player-toolbar"><button type="button" id="player-help-toggle" aria-expanded="false" aria-controls="player-help"><kbd>H</kbd> Controls</button><button type="button" id="player-recenter"><kbd>R</kbd> Centre camera</button></div>
      <div id="player-help" hidden><div class="player-help-title">Make yourself at home</div><p><kbd>W A S D</kbd> Move <span>·</span> <kbd>Shift</kbd> Run <span>·</span> <kbd>Space</kbd> Jump</p><p>Drag to look <span>·</span> Scroll to zoom <span>·</span> <kbd>← →</kbd> Turn</p><p>Approach a villager, then <kbd>E</kbd> Talk <span>·</span> <kbd>Esc</kbd> Overview</p><p class="controller-help">Controller: left stick move · right stick look · A jump · LT run · X talk · B back</p></div>
      <div id="player-wardrobe" hidden><span class="player-eyebrow">Choose your character</span><div></div></div>
      <button type="button" id="player-interact" hidden><span class="talk-key">E</span><span><small>Start a conversation</small><strong></strong></span><span class="talk-spark">${icon('chat')}</span></button>
      <div id="player-toast" role="status" aria-live="polite"></div>
      <div id="player-touch"><div id="player-stick" aria-label="Drag to move"><span></span></div><div class="touch-actions"><button type="button" data-touch="run" aria-pressed="false">Run</button><button type="button" data-touch="jump">Jump</button><button type="button" data-touch="talk">Talk</button></div></div>
    `;
    document.body.append(this.root);
    this.activity=this.root.querySelector('#player-activity');
    this.prompt=this.root.querySelector('#player-interact');
    this.prompt.addEventListener('click',()=>actions.talk());
    this.root.querySelector('#player-help-toggle').addEventListener('click',()=>this.toggleHelp());
    this.root.querySelector('#player-recenter').addEventListener('click',()=>actions.recenter());
    const wardrobe=this.root.querySelector('#player-wardrobe');
    const outfit=this.root.querySelector('#player-outfit'); outfit.setAttribute('aria-expanded','false');outfit.setAttribute('aria-controls',wardrobe.id);
    registerPanel(wardrobe,outfit);
    registerPanel(this.root.querySelector('#player-help'),this.root.querySelector('#player-help-toggle'));
    for (const [panel,title] of [[wardrobe,'Your character'],[this.root.querySelector('#player-help'),'Exploring the valley']]) {
      const header=document.createElement('header');header.innerHTML=`<h2>${title}</h2><button type="button" aria-label="Close ${title.toLowerCase()}">${icon('close')}</button>`;
      header.querySelector('button').onclick=()=>setPanel(panel,false);panel.prepend(header);panel.setAttribute('aria-label',title);
    }
    outfit.addEventListener('click',()=>setPanel(wardrobe,wardrobe.hidden));
    for (const kind of ['Celestial Mage','Ranger','Witch','Wizard','Starfarer','Mage','Rogue','Rogue_Hooded','Knight','Barbarian']) {
      const button=text('button',kind.replaceAll('_',' '));button.type='button';button.dataset.kind=kind;
      button.addEventListener('click',()=>{ actions.character(kind); setPanel(wardrobe,false); });
      wardrobe.querySelector(':scope > div').append(button);
    }
    this.dialog=document.createElement('dialog');this.dialog.id='village-conversation';
    this.dialog.setAttribute('aria-labelledby','conversation-name');
    this.dialog.innerHTML=`<div class="conversation-topline"><span class="player-eyebrow">A moment in the village</span><button type="button" class="conversation-close" aria-label="End conversation">×</button></div><header><span id="conversation-sign" aria-hidden="true"></span><div><h2 id="conversation-name"></h2><p id="conversation-detail"></p></div><div class="friendship"><span id="friendship-label"></span><div class="friendship-track"><span></span></div></div></header><div class="conversation-speech" aria-live="polite" aria-atomic="true"></div><div class="conversation-choices"></div><footer><span>Choose a reply <span class="desktop-shortcuts">· number keys 1–7</span></span><button type="button" class="conversation-goodbye">Say goodbye <kbd>Esc</kbd></button></footer>`;
    document.body.append(this.dialog);
    this.dialog.addEventListener('cancel',e=>{ e.preventDefault();actions.closeTalk(); });
    this.dialog.querySelector('.conversation-close').addEventListener('click',()=>actions.closeTalk());
    this.dialog.querySelector('.conversation-goodbye').addEventListener('click',()=>actions.closeTalk());
    this.dialog.addEventListener('keydown',e=>{
      const n=Number(e.key); if (n>=1 && n<=TOPICS.length) { e.preventDefault();this.dialog.querySelectorAll('.conversation-choices button')[n-1]?.click(); }
    });
    this._touchControls();
  }
  setActive(active) {
    closePanels();
    document.getElementById('crew-menu')?.classList.toggle('player-unavailable',active);
    this.root.hidden=!active;document.body.classList.toggle('player-mode',active);
    if(!active) { this.prompt.hidden=true;this.root.querySelector('#player-wardrobe').hidden=true; }
  }
  toggleHelp() {
    const help=this.root.querySelector('#player-help');setPanel(help,help.hidden);
  }
  status(activity,kind) {
    const value=`${activity} · ${kind.replaceAll('_',' ')}`;
    if(this.activity.textContent!==value)this.activity.textContent=value;
    if(this.kind!==kind){
      this.kind=kind;
      for(const b of this.root.querySelectorAll('[data-kind]')) b.setAttribute('aria-pressed',String(b.dataset.kind===kind));
    }
  }
  nearby(figure,point) {
    this.prompt.hidden=!figure;
    if(!figure)return;
    const name=this.prompt.querySelector('strong');if(name.textContent!==figure.profile.name)name.textContent=figure.profile.name;
    const x=Math.max(140,Math.min(innerWidth-140,point.x));
    const y=Math.max(95,Math.min(innerHeight-245,point.y));
    this.prompt.style.transform=`translate(-50%, -100%) translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
  notify(message) {
    const toast=this.root.querySelector('#player-toast');toast.textContent=message;
    clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>toast.textContent='',4500);
  }
  open(profile) {
    closePanels();
    this.profile=profile;const known=this.friendships.get(profile.id).met;
    this.friendships.meet(profile.id);
    this.dialog.querySelector('#conversation-name').textContent=profile.name;
    this.dialog.querySelector('#conversation-sign').textContent=profile.glyph+'\uFE0E';
    this.dialog.querySelector('#conversation-detail').textContent=`${profile.trade.replaceAll('_',' ')} · ${profile.sign} · ${profile.temper}`;
    this.topics(known ? 'There you are again! I was hoping we would find another moment to talk. What is on your mind?' : `Hello, traveller. I am ${profile.name.split(' ')[0]}. There is always time for a little company. Ask me about my project, my neighbours, or the latest village news.`);
    this.dialog.showModal();this.dialog.querySelector('.conversation-choices button')?.focus();
  }
  close() { this.dialog.close();this.profile=null; }
  friendship() {
    const status=this.friendships.status(this.profile.id);
    this.dialog.querySelector('#friendship-label').textContent=status.label;
    this.dialog.querySelector('.friendship-track span').style.width=`${status.progress*100}%`;
  }
  choices(items) {
    const choices=this.dialog.querySelector('.conversation-choices');choices.replaceChildren();
    this.dialog.querySelector('.desktop-shortcuts').textContent=`· number keys 1–${items.length}`;
    items.forEach((item,i)=>{
      const button=document.createElement('button');button.type='button';
      const symbol=text('span',String(i+1),'choice-symbol');symbol.setAttribute('aria-hidden','true');
      button.append(symbol,text('span',item.label));
      button.addEventListener('click',()=>{ item.choose();choices.querySelector('button')?.focus(); });choices.append(button);
    });
    this.friendship();
  }
  say(message) { this.dialog.querySelector('.conversation-speech').textContent=message; }
  topics(message='What else would you like to talk about?') {
    this.say(message);
    const primary=['project','neighbours','story','work'];
    this.choices([...primary.map(id=>{const topic=TOPICS.find(t=>t.id===id);return {...topic,choose:()=>this.topic(topic)};}),
      {label:'Talk about the stars',icon:'☉',choose:()=>this.starTopics()}]);
  }
  starTopics() {
    this.say('A little star talk? Here are the things we wonder about in the village.');
    this.choices([...TOPICS.filter(t=>!['project','neighbours','story','work'].includes(t.id)).map(topic=>({...topic,choose:()=>this.topic(topic)})),
      {label:'Back to village life',icon:'↩',choose:()=>this.topics()}]);
  }
  topic(topic) {
    this.friendships.meet(this.profile.id,topic.id);this.say(topic.reply(this.profile));
    this.actions.gesture();
    this.choices([...topic.followups.map(f=>({ label:f.label, choose:()=>{
      this.say(typeof f.text==='function'?f.text(this.profile):f.text);this.actions.gesture();
      this.choices([{ label:'Let’s talk about something else',icon:'✧',choose:()=>this.topics() },
        { label:'It was lovely talking to you',icon:'↗',choose:()=>this.actions.closeTalk() }]);
    }})),{ label:'Ask about something else',icon:'✧',choose:()=>this.topics() }]);
  }
  _touchControls() {
    const stick=this.root.querySelector('#player-stick'), knob=stick.querySelector('span');
    const update=e=>{
      const rect=stick.getBoundingClientRect(),dx=e.clientX-rect.left-rect.width/2,dy=e.clientY-rect.top-rect.height/2;
      const length=Math.max(38,Math.hypot(dx,dy));
      this.actions.touchMove(dx/length,-dy/length);knob.style.transform=`translate(${dx/length*32}px,${dy/length*32}px)`;
    };
    let held=null;
    stick.addEventListener('pointerdown',e=>{ held=e.pointerId;stick.setPointerCapture(held);update(e); });
    stick.addEventListener('pointermove',e=>{if(e.pointerId===held)update(e);});
    const release=()=>{held=null;this.actions.touchMove(0,0);knob.style.transform='';};
    stick.addEventListener('lostpointercapture',release);stick.addEventListener('pointercancel',release);
    stick.addEventListener('pointerup',release);
    for(const b of this.root.querySelectorAll('[data-touch]'))b.addEventListener('click',()=>{
      const action=b.dataset.touch;
      if(action==='run'){const on=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(on));this.actions.touchRun(on);}
      if(action==='jump')this.actions.jump();if(action==='talk')this.actions.talk();
    });
  }
}
