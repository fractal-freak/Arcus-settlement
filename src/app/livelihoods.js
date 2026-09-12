/** Shared occupations and supply chains. No rendering or private session data. */
export const ROLES = {
  farmer: { label:'Farmer', task:'Tending and harvesting grain', kinds:/building_grain/, output:'grain', amount:6, animation:'Interact' },
  woodcutter: { label:'Woodcutter', task:'Cutting timber', kinds:/tree|resource_lumber/, output:'timber', amount:4, animation:'Interact' },
  quarryman: { label:'Quarry worker', task:'Quarrying stone', kinds:/rock|resource_stone/, output:'stone', amount:4, animation:'Interact' },
  water_carrier: { label:'Water carrier', task:'Drawing fresh water', kinds:/bucket_empty/, output:'water', amount:16, animation:'Interact' },
  miller: { label:'Miller', task:'Grinding grain into flour', kinds:/building_grain|sack/, input:{grain:3}, output:'flour', amount:3, animation:'Interact' },
  baker: { label:'Baker', task:'Preparing bread for the village', kinds:/barrel|sack/, input:{flour:2,water:1}, output:'food', amount:8, animation:'Interact' },
  shepherd: { label:'Shepherd', task:'Gathering wool and tending pasture', kinds:/fence_wood/, output:'wool', amount:3, animation:'Interact' },
  weaver: { label:'Weaver', task:'Weaving cloth', kinds:/crate|pallet/, input:{wool:2}, output:'cloth', amount:3, animation:'Interact' },
  smith: { label:'Smith', task:'Making and repairing tools', kinds:/weaponrack|resource_stone/, input:{stone:2,timber:1}, output:'tools', amount:2, animation:'Interact' },
  builder: { label:'Builder', task:'Preparing the next building', kinds:/building_stage|ladder|resource_stone/, input:{timber:2,stone:2,tools:1}, output:'construction', amount:4, animation:'Interact' },
  herbalist: { label:'Herbalist', task:'Gathering medicinal plants', kinds:/tree|waterplant/, output:'herbs', amount:3, animation:'Interact' },
  carter: { label:'Carter', task:'Sorting and hauling supplies', kinds:/wheelbarrow|crate|pallet/, output:'transport', amount:4, animation:'Interact' },
};
// Essentials have several hands; every sixteen citizens provide a complete chain.
const ASSIGNMENTS = ['farmer','water_carrier','woodcutter','quarryman','farmer','miller','baker','shepherd','weaver','smith','builder','herbalist','carter','farmer','baker','builder'];
export function occupationFor(seed) { return ASSIGNMENTS[((Math.trunc(seed)||0)%ASSIGNMENTS.length+ASSIGNMENTS.length)%ASSIGNMENTS.length]; }
export function advanceEconomy(previous, citizens) {
  const stock = { grain:0,water:0,timber:0,stone:0,flour:0,food:0,wool:0,cloth:0,tools:0,construction:0,herbs:0,transport:0,...previous?.stock };
  const produced = {};
  // Two passes make dependencies independent of citizen ordering.
  const workers = citizens.map(c=>ROLES[c.occupation || occupationFor(c.seed)]).filter(Boolean);
  for (const role of Object.values(ROLES)) for (const worker of workers) {
    if(worker!==role)continue;
    if (Object.entries(role.input || {}).some(([key,n])=>stock[key]<n)) continue;
    for (const [key,n] of Object.entries(role.input || {})) stock[key]-=n;
    stock[role.output]+=role.amount;
    produced[role.output]=(produced[role.output]||0)+role.amount;
  }
  const need = citizens.length*.65;
  const fed = need ? Math.min(1,stock.food/need) : 1;
  const watered = need ? Math.min(1,stock.water/need) : 1;
  stock.food=Math.max(0,stock.food-need); stock.water=Math.max(0,stock.water-need);
  const building = Math.min(stock.construction, Math.ceil(citizens.length/8));
  stock.construction-=building;
  for (const k of Object.keys(stock)) stock[k]=Math.round(Math.min(2000,Math.max(0,stock[k]))*100)/100;
  return { stock, produced, fed, watered, building, workRate:.35+.35*Math.min(fed,watered)+Math.min(.8,building*.12), ticks:(previous?.ticks||0)+1 };
}
