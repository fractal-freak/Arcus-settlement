/** The old court's ground plan: dry stones, worn margins and low plant growth. */
import { SANCTUARY, OFFERING } from './village.js';
import { smoothHeightAt, isWater, hash2, WATER_LEVEL, STEP } from './terrain.js';
const ease = (a,b,x) => { const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t); };

export function courtCoverage(x,z) {
  if (isWater(x,z)) return 0;
  const r=Math.hypot(x,z), a=Math.atan2(z,x);
  const rim=SANCTUARY.pavingRadius-.35+Math.sin(a*5+.8)*.32+Math.cos(a*9)*.18;
  const height=smoothHeightAt(x,z);
  // Let the old court end naturally before the bank falls toward the river.
  return (1-ease(7.1,rim,r))*ease(WATER_LEVEL+STEP*.5+.015,WATER_LEVEL+STEP*.5+.12,height);
}
export function courtGroundSafe(x,z,margin=.45) {
  const h=smoothHeightAt(x,z);
  for(const [dx,dz] of [[0,0],[margin,0],[-margin,0],[0,margin],[0,-margin]]) {
    if(isWater(x+dx,z+dz)||Math.abs(smoothHeightAt(x+dx,z+dz)-h)>margin*.24) return false;
  }
  return true;
}
export const COURT_STONES = (()=>{
  const stones=[];
  for(let ring=0,r=3.75;r<SANCTUARY.pavingRadius;ring++,r+=.57) {
    const count=Math.round(2*Math.PI*r/.72);
    for(let i=0;i<count;i++) {
      const a=(i+(ring%2)*.49)/count*Math.PI*2;
      const wear=ease(6.7,SANCTUARY.pavingRadius,r);
      const jitter=(hash2(i,ring,301)-.5)*(.16+wear*.42);
      const x=Math.cos(a)*(r+jitter), z=Math.sin(a)*(r+jitter);
      const coverage=courtCoverage(x,z);
      if(hash2(i,ring,330)>Math.pow(coverage,.72)||!courtGroundSafe(x,z))continue;
      const size=1-wear*.28;
      stones.push({x,z,coverage,
        a:a+(hash2(i,ring,303)-.5)*(.28+wear*.85),
        width:2*Math.PI*r/count*(.88+hash2(i,ring,304)*.12)*size,
        depth:(.49+hash2(i,ring,305)*.12)*size,
        height:(.12+hash2(i,ring,306)*.10)*(1-wear*.5),
        // Outer stones sink into the soil instead of making a raised kerb.
        sink:wear*(.055+hash2(i,ring,331)*.035),
        tone:.78+hash2(i,ring,302)*.30});
    }
  }
  return stones;
})();

export const COURT_GROWTH = (()=>{
  const plants=[];
  const add=(x,z,seed,scale)=>{
    if(!courtGroundSafe(x,z,.2))return;
    if(Math.hypot(x-OFFERING.x,z-OFFERING.z)<OFFERING.r+.6)return;
    plants.push({x,z,seed,scale});
  };
  // Ferns and small ground-cover plants tuck into the boulder's sheltered foot.
  for(let i=0;i<76;i++) {
    const a=i/76*Math.PI*2, r=3.30+hash2(i,8,901)*.82;
    // Broken colonies leave patches of roots and weathered stone exposed.
    if(Math.sin(a*4+.7)>.68 && hash2(i,14,901)>.28)continue;
    // Keep a modest opening beneath the inscription and toward the offerings.
    if(Math.sin(a)>.91 && hash2(i,9,901)>.25)continue;
    add(Math.cos(a)*r,Math.sin(a)*r,i,.58+hash2(i,10,901)*.6);
  }
  // Sparse growth reclaims missing stones toward the worn outer edge.
  for(let i=0;i<110;i++) {
    const a=hash2(i,11,902)*Math.PI*2,r=7.2+hash2(i,12,902)*3.7;
    const x=Math.cos(a)*r,z=Math.sin(a)*r;
    if(courtCoverage(x,z)<.03||COURT_STONES.some(s=>Math.hypot(s.x-x,s.z-z)<.30))continue;
    add(x,z,100+i,.30+hash2(i,13,902)*.4);
  }
  return plants;
})();
