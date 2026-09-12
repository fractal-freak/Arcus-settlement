import {BufferGeometry,Float32BufferAttribute} from 'three';
import {ruinOpeningAt} from '../app/ruinedTower.js';
/** Open-backed solid masonry, including connected, chipped top and window reveals. */
export function ruinedTowerGeometry(p){
  const points=[],n=p.crown.length,rows=Math.ceil(p.h/.22),dy=p.h/rows,r=p.w/2,t=p.thickness;
  const add=(a,b,c)=>points.push(...a,...b,...c),quad=(a,b,c,d)=>{add(a,b,d);add(b,c,d);};
  const at=(i,y,inner=false)=>{
    const a=i/n*Math.PI*2,base=r+(1-Math.min(y/2.2,1))*.13;
    const wear=.014*Math.sin(a*31+y*7)+.009*Math.cos(a*17-y*11);
    return [Math.sin(a)*(base-(inner?t:0)+wear),y,Math.cos(a)*(base-(inner?t:0)+wear)];
  };
  const present=(i,y)=>y>=0&&y<(p.crown[(i+n)%n]+p.crown[(i+1+n)%n])/2&&!ruinOpeningAt(p,(i+.5)/n*Math.PI*2,y);
  for(let i=0;i<n;i++)for(let row=0;row<rows;row++){
    const y=row*dy,topA=p.crown[i],topB=p.crown[(i+1)%n];
    if(y>=Math.max(topA,topB)||!present(i,y+dy*.5))continue;
    const a=Math.min(y+dy,topA),b=Math.min(y+dy,topB);
    if(a<=y||b<=y)continue;
    quad(at(i,y),at(i+1,y),at(i+1,b),at(i,a));
    quad(at(i+1,y,true),at(i,y,true),at(i,a,true),at(i+1,b,true));
    if(!present(i-1,y+dy*.5))quad(at(i,y,true),at(i,y),at(i,a),at(i,a,true));
    if(!present(i+1,y+dy*.5))quad(at(i+1,y),at(i+1,y,true),at(i+1,b,true),at(i+1,b));
    if(!present(i,y-dy*.5))quad(at(i+1,y),at(i,y),at(i,y,true),at(i+1,y,true));
    // Every exposed upper course returns into the inner face. No detached capstones.
    if(!present(i,y+dy*1.5)||a===topA||b===topB)quad(at(i,a),at(i+1,b),at(i+1,b,true),at(i,a,true));
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(points,3));g.computeVertexNormals();g.translate(p.x,p.y,p.z);return g;
}
