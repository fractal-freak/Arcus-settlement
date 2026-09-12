/** A continuous fracture rim, shared with the renderer; never isolated crown blocks. */
export function ruinCrown(height,count=96){
  const breaks=[[0,3.1],[.65,3.6],[1.15,4.9],[1.65,4.35],[2.1,2.5],[2.8,1.5],[3.25,1.8],[3.85,2.9],[4.3,2.1],[4.9,2.35],[5.3,3.65],[5.85,3.2],[Math.PI*2,3.1]];
  return Array.from({length:count},(_,i)=>{
    const a=i/count*Math.PI*2;
    const at=breaks.findIndex((p,j)=>j<breaks.length-1&&a>=p[0]&&a<breaks[j+1][0]);
    const p=breaks[at],q=breaks[at+1],t=(a-p[0])/(q[0]-p[0]);
    const crown=height-(p[1]+(q[1]-p[1])*t);
    return Math.floor(crown/.26)*.26+.045*Math.sin(a*31);
  });
}
export function ruinOpeningAt(p,angle,y){
  const a=Math.atan2(Math.sin(angle),Math.cos(angle)),doorWidth=1.18;
  if(y<3.0 && Math.abs(a*p.w/2)<doorWidth*(y<2.0?1:Math.sqrt(Math.max(0,3-y))))return true;
  for(const sill of p.sills){
    const t=y-sill;if(t<0||t>1.65)continue;
    const u=Math.abs(Math.atan2(Math.sin(angle*4),Math.cos(angle*4)))*p.w/8;
    if(u<.29*(t<1.15?1:Math.sqrt(Math.max(0,(1.65-t)/.5))))return true;
  }
  return false;
}
