/** Reader-facing language for public settlement facts. Never fabricates events. */
const GOALS = {
  sacred: ['Care for the settlement stone', 'Add low stone borders, cairns and banners around the stone while keeping its clearing open.'],
  density: ['Tend empty corners', 'Add gardens, ground detail and paving around homes and the square.'],
  variety: ['Give places different uses', 'Add a wider mix of useful structures and equipment.'],
  livedIn: ['Equip homes and workplaces', 'Put firewood, tools, storage and market stalls where villagers can use them.'],
  silhouette: ['Make landmarks easier to spot', 'Add trees, banners and watchposts that stand above the lanes and houses.'],
  composition: ['Organise yards and paths', 'Group supplies in yards and mark the paths through the village.'],
  transitions: ['Tend the village edges', 'Plant riverbanks and add fences and greenery between the village and wild ground.'],
  colour: ['Bring colour to the village', 'Add colourful banners and stalls around homes and lanes.'],
  waterfront: ['Bring life to the riverbank', 'Add reeds, waterlilies and supplies beside the river.'],
  heraldry: ['Raise village banners', 'Add flags along the lanes so the village has colour above its rooftops.'],
  fortification: ['Define walls and entrances', 'Add stone boundaries and gates around the settlement.'],
  industry: ['Stock the craft yards', 'Put timber, stone and trade supplies beside workplaces.'],
  garrison: ['Equip the guard yards', 'Add practice targets, weapon storage and guard posts.'],
  civic_assembly: ['Make places to gather', 'Add stages and boundaries for public gathering places.'],
};
const TASKS = {
  'gather the yard around one thing': 'group barrels, crates and supplies into a storage area in a yard',
  'range the odds and ends along the lanes': 'arrange storage and supplies beside the lanes',
  'hang colour where there is none': 'hang green and blue banners near the houses',
  'bring some colour to the far lane': 'add colourful banners and a stall at the village edge',
  'fit out the yard for practice': 'equip a yard with archery targets and weapon storage',
  'tidy the odd corners nobody looks at': 'plant small trees and place rocks in bare corners',
  'leave the tools where the work is': 'put tools and building supplies beside the lanes',
  'break up the flat blue water surface near the bank': 'plant waterlilies near the riverbank',
  'give verticality and high contrast to rooftops and open lanes': 'raise colourful flags along the lanes',
  'place freight and cargo staging along the river margin': 'arrange crates, barrels and pallets beside the river',
};
export function plainTask(task = '') {
  const raw=String(task).trim().replace(/^to\s+/, '');
  return TASKS[raw] || raw;
}
export function goalFor(key, dimensions=[]) {
  const known=GOALS[key];
  const d=dimensions.find(d=>d.key===key);
  return {title:known?.[0] || d?.name || 'Improve the village',
    reason:known?.[1] || d?.why || 'Finish a useful improvement to the settlement.'};
}
export function plainEvent(value='') {
  let result=String(value);
  for(const [from,to] of Object.entries(TASKS))result=result.replaceAll(from,to);
  return result.replace('that had stopped earning their place', 'to make room')
    .replace('and used the room to', 'and then worked to')
    .replace('were handfasted by the Stone', 'became partners in a ceremony by the stone')
    .replace('are thick as thieves now', 'became close friends');
}
const SOCIAL=new Set(['bond','love','feud','peace','arrival','departure']);
const WORK=new Set(['work','rework','turn','stuck']);
const LABELS={bond:'New friendship',love:'New partners',feud:'A falling-out',peace:'Making up',arrival:'New neighbour',departure:'Leaving the village',work:'Project finished',rework:'Replaced old work',turn:'Changed plans',stuck:'Could not build',find:'A discovery',unearth:'From the dig'};
export function eventCategory(event) {return WORK.has(event.kind)?'improvements':SOCIAL.has(event.kind)?'life':'discoveries';}
export function eventLabel(event) {return LABELS[event.kind] || 'Village news';}
export function storiesFor(life, seed, category) {
  return (life?.chronicle || []).filter(e=>(e.who || []).includes(seed)&&(!category||eventCategory(e)===category));
}
export function socialSummary(c={}) {
  const counts=[];
  if(Number.isFinite(c.friends))counts.push(`${c.friends} ${c.friends===1?'friend':'friends'}`);
  if(Number.isFinite(c.feuds))counts.push(`${c.feuds} ${c.feuds===1?'rivalry':'rivalries'}`);
  return [c.partner?`Partner: ${c.partner}`:'No partner recorded',...counts].join(' · ');
}
export function citizenAside(c={}) {
  if(c.feuds>c.friends&&c.feuds>0)return '“I get along with everyone. Some of them simply haven’t realised it yet.”';
  if(c.friends>10)return '“I tried to cross the square before lunch. Twelve conversations later, it was supper.”';
  if(c.partner)return '“We agree on the important things. Which things are important is still under discussion.”';
  const lines=['“The village is small. My list of errands has not received the news.”','“I put my tools somewhere safe. That was the first mistake.”','“I came for a quiet life. Someone gave me a committee.”'];
  return lines[Math.abs(Number(c.seed)||0)%lines.length];
}
