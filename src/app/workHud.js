import { registerPanel, setPanel } from './panels.js';
import { citizenProject } from './citizenProjects.js';
import { goalFor, plainEvent, eventCategory, eventLabel, storiesFor, socialSummary, citizenAside } from './journalData.js';
import './journal.css';

const el=(tag,content,cls)=>{const e=document.createElement(tag);if(content!=null)e.textContent=content;if(cls)e.className=cls;return e;};
const button=(label,action,cls)=>{const b=el('button',label,cls);b.type='button';b.onclick=action;return b;};

/** One journal for projects, people and their recorded history. */
export class WorkHud {
  constructor(folk,visit) {
    this.folk=folk;this.visit=visit;this.life={};this.view='improvements';this.filter='all';this.limit=12;
    this.root=el('aside',null,'village-journal');this.root.id='village-work';this.root.setAttribute('aria-label','Village journal');
    this.toggle=button('Village journal',()=>this.open(this.panel.hidden));this.toggle.id='journal-toggle';this.toggle.setAttribute('aria-label','Village journal');this.toggle.setAttribute('aria-controls','village-work-panel');this.toggle.setAttribute('aria-expanded','false');
    this.panel=el('section');this.panel.id='village-work-panel';this.panel.hidden=true;
    const header=el('header');const title=el('div');title.append(el('span','PROJECTS, PEOPLE & STORIES','journal-eyebrow'),el('h2','Village journal'));
    title.querySelector('h2').id='journal-title';this.panel.setAttribute('aria-labelledby','journal-title');
    this.date=el('p',null,'journal-date');title.append(this.date);
    header.append(title,button('×',()=>this.open(false),'journal-close'));header.lastChild.setAttribute('aria-label','Close village journal');
    this.nav=el('nav');this.nav.setAttribute('aria-label','Journal sections');
    for(const [id,label] of [['improvements','Citizen projects'],['life','Village life'],['chronicle','Chronicle']]){
      const b=button(label,()=>{this.view=id;this.selected=null;this.limit=12;this.search.value='';this.refresh();});b.dataset.view=id;this.nav.append(b);
    }
    const label=el('label','Search this section','journal-search');
    this.search=el('input');this.search.type='search';this.search.placeholder='Find a citizen, project or story…';
    this.search.oninput=()=>{this.limit=12;this.renderContent();};label.append(this.search);
    this.content=el('div',null,'journal-content');this.content.id='journal-content';
    this.panel.append(header,this.nav,label,this.content);this.root.append(this.toggle,this.panel);document.body.append(this.root);
    registerPanel(this.panel,this.toggle);
    this.root.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'&&!this.panel.hidden){e.preventDefault();e.stopPropagation();this.open(false);}});
  }
  open(show){setPanel(this.panel,show,{focus:false});if(show){this.refresh();this.nav.querySelector(`[data-view="${this.view}"]`).focus();}else this.toggle.focus();}
  sync(life){const signature=JSON.stringify(life);if(signature===this.signature)return;this.signature=signature;this.life=life||{};this.refresh();}
  tick(){} // Saved news changes with the feed, never with an animation frame.
  refresh(){
    if(this.panel.hidden)return;
    this.date.textContent=this.life.said?`${this.life.said} · settlement time`:'Waiting for village news';
    for(const b of this.nav.children)b.setAttribute('aria-pressed',String(b.dataset.view===this.view));
    this.renderContent();
  }
  matches(...values){const q=this.search.value.trim().toLowerCase();return !q||values.join(' ').toLowerCase().includes(q);}
  heading(title,description){this.content.append(el('h3',title),el('p',description,'journal-intro'));}
  renderContent(){
    const scroll=this.content.scrollTop;
    this.content.replaceChildren();
    if(this.selected!=null)this.person(this.selected);
    else if(this.view==='improvements')this.projects();
    else if(this.view==='life')this.people();
    else this.chronicle();
    this.content.scrollTop=scroll;
  }
  showPerson(seed){this.selected=seed;this.renderContent();this.content.scrollTop=0;this.content.querySelector('button')?.focus();}
  residentButton(c){return button(c.name,()=>this.showPerson(c.seed),'journal-person-link');}
  visitButton(c){
    return button('Find in village',()=>{const f=this.folk.folk.find(f=>f.identity===c.seed);if(f){this.visit(f);this.notice.textContent=`Looking at ${c.name}. Choose Play and approach them to talk.`;}else this.notice.textContent='This citizen is not visible in the village yet. Their saved story is available here.';},'journal-find');
  }
  more(total){if(total>this.limit)this.content.append(button(`Show more (${total-this.limit} remaining)`,()=>{this.limit+=12;this.renderContent();},'journal-more'));}
  projectCard(c){
    const p=citizenProject(c),card=el('article',null,'journal-card project-row');
    card.append(this.residentButton(c),el('h4',p.task[0].toUpperCase()+p.task.slice(1)));
    card.append(el('p',goalFor(p.dimension,this.life.dimensions).reason));
    const progress=el('progress');progress.max=1;progress.value=p.progress;progress.setAttribute('aria-label',`${c.name}: ${p.percent}% of project work`);
    card.append(el('span',`${p.percent}% of this citizen’s construction work`,'journal-meta'),progress);
    return card;
  }
  projects(){
    this.heading('Construction around the village','These are citizens’ simulated jobs. The percentages measure their work on one assignment, not progress on game development. Jobs finish as settlement time advances; supplies and work opportunities affect the pace.');
    if(this.life.quality?.weakest){const g=goalFor(this.life.quality.weakest,this.life.dimensions);const focus=el('div',null,'journal-focus');focus.append(el('span','CURRENT VILLAGE PRIORITY','journal-eyebrow'),el('h4',g.title));this.content.append(focus);}
    const citizens=(this.life.citizens||[]).filter(c=>citizenProject(c)&&this.matches(c.name,citizenProject(c).task,goalFor(c.dim,this.life.dimensions).title));
    this.content.append(el('p',`${citizens.length} active projects${this.search.value.trim() ? " matching your search" : ""}`,'journal-meta'));
    for(const c of citizens.slice(0,this.limit))this.content.append(this.projectCard(c));
    if(!citizens.length)this.content.append(el('p','No matching assignments. Try another search, or wait for the next village update.'));
    this.more(citizens.length);
    const details=el('details');details.append(el('summary','How projects are chosen'));
    details.append(el('p','Every half hour, the AI critic reviews the world and can update the available jobs. Citizens choose work that addresses the village’s weakest scores. A blocked project may be replaced with another. These are simulation goals, not a promise that every change looks better.'));
    this.content.append(details);
    const economy=this.life.economy;
    if(economy?.stock){const stores=el('details');stores.append(el('summary','Village supplies'));
      stores.append(el('p','Daily jobs supply food, water, materials and tools. These stores support improvement projects.'));
      for(const key of ['food','water','timber','stone','tools'])if(Number.isFinite(economy.stock[key]))stores.append(el('p',`${key[0].toUpperCase()+key.slice(1)}: ${Math.floor(economy.stock[key])}`));
      this.content.append(stores);}
  }
  people(){
    this.heading('The people behind the projects','Partners, friendships, rivalries and little things worth knowing. Open a citizen to read their recent stories.');
    const citizens=(this.life.citizens||[]).filter(c=>this.matches(c.name,c.temper,c.trade,c.partner,socialSummary(c)));
    for(const c of citizens.slice(0,this.limit)){
      const card=el('article',null,'journal-card citizen-row');card.append(this.residentButton(c),el('p',socialSummary(c)));
      const story=storiesFor(this.life,c.seed,'life')[0];
      if(story)card.append(el('p',plainEvent(story.text),'journal-story-preview'));
      else card.append(el('p',citizenAside(c),'journal-aside'),el('small','A little character flavour'));
      this.content.append(card);
    }
    if(!citizens.length)this.content.append(el('p','No citizens match that search.'));
    this.more(citizens.length);
  }
  person(seed){
    const c=(this.life.citizens||[]).find(c=>c.seed===seed);
    this.content.append(button('← Back to the list',()=>{this.selected=null;this.renderContent();},'journal-back'));
    if(!c){this.content.append(el('p','This citizen is no longer in the current village roll. Their past stories remain in the chronicle.'));return;}
    const trade=this.folk.folk.find(f=>f.identity===seed)?.profile.trade || c.trade || 'Villager';
    this.heading(c.name,`${trade} · ${c.temper || 'A neighbour'}`);
    this.content.append(el('p',socialSummary(c)));
    this.content.append(el('p',citizenAside(c),'journal-aside'),el('small','Character flavour; recorded events appear below.'));
    this.notice=el('p',null,'journal-meta');this.notice.setAttribute('role','status');this.content.append(this.visitButton(c),this.notice);
    if(c.partner){const partner=(this.life.citizens||[]).find(p=>p.name===c.partner);if(partner)this.content.append(button(`Meet ${partner.name}`,()=>this.showPerson(partner.seed),'journal-person-link'));}
    if(citizenProject(c)){this.content.append(el('h3','Their current project'),this.projectCard(c),el('p',`${c.finished ?? 0} projects completed so far.`,'journal-meta'));}
    const figure=this.folk.folk.find(f=>f.identity===seed);
    if(figure?.job){this.content.append(el('h3','Their daily livelihood'),el('p',`${figure.job.role.label}: ${figure.job.status}. This daily routine supplies the village while their improvement project advances in the saved simulation.`));}
    this.content.append(el('h3','Recent stories about them'));
    const stories=storiesFor(this.life,seed);
    for(const story of stories.slice(0,12))this.content.append(this.eventCard(story));
    if(!stories.length)this.content.append(el('p','No recent stories about this citizen have reached the chronicle.'));
  }
  eventCard(event){
    const card=el('article',null,'journal-card journal-event');
    card.append(el('span',eventLabel(event),'journal-event-kind'),el('span',event.at || 'Earlier in the village','journal-meta'),el('p',plainEvent(event.text)));
    if(event.quote){const quote=el('blockquote',event.quote);quote.append(el('cite',event.source || 'Source not recorded'));card.append(quote);}
    const links=el('div',null,'journal-event-people');
    for(const seed of event.who||[]){const c=(this.life.citizens||[]).find(c=>c.seed===seed);if(c)links.append(this.residentButton(c));}
    card.append(links);return card;
  }
  chronicle(){
    this.heading('The chronicle','What actually happened, newest first. Pick a kind of story or follow a name to meet the people involved.');
    const filters=el('div',null,'journal-filters');
    for(const [id,label] of [['all','Everything'],['life','Life & relationships'],['improvements','World improvements'],['discoveries','Discoveries']]){
      const b=button(label,()=>{this.filter=id;this.limit=12;this.renderContent();});b.setAttribute('aria-pressed',String(this.filter===id));filters.append(b);
    }
    this.content.append(filters);
    const events=(this.life.chronicle||[]).filter(e=>(this.filter==='all'||eventCategory(e)===this.filter)&&this.matches(plainEvent(e.text),e.quote,e.source,eventLabel(e)));
    for(const event of events.slice(0,this.limit))this.content.append(this.eventCard(event));
    if(!events.length)this.content.append(el('p','No recorded stories match this filter yet. Try Everything or clear your search.'));
    this.more(events.length);
  }
}
