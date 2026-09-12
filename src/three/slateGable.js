import {BufferGeometry,Float32BufferAttribute} from 'three';

/** Slate courses follow the authored roof slope; broken wings stay open. */
export function slateGableGeometry(p) {
  const positions=[],colours=[];
  const rows=Math.ceil(Math.hypot(p.w/2,p.h)/.32),pitch=.44;
  const triangle=(a,b,c,tone)=>{
    positions.push(...a,...b,...c);
    for(let i=0;i<3;i++)colours.push(tone*.96,tone,tone*1.04);
  };
  const quad=(a,b,c,d,tone,side)=>{
    if(side<0){triangle(a,b,d,tone);triangle(b,c,d,tone);}
    else {triangle(a,d,b,tone);triangle(b,d,c,tone);}
  };
  for(const side of p.half?[-1]:[-1,1])for(let row=0;row<rows;row++) {
    const low=row/rows,high=Math.min(1,(row+1.12)/rows);
    for(let start=-p.d/2-(row%2)*pitch/2;start<p.d/2;start+=pitch) {
      const za=Math.max(-p.d/2,start)+.006,zb=Math.min(p.d/2,start+pitch)-.006;
      if(zb<=za)continue;
      const seed=Math.sin(row*127.1+Math.round(start/pitch)*311.7+p.x*11+p.z*3)*43758.5453;
      const variation=seed-Math.floor(seed);
      const lift=.018+variation*.012,tone=.82+variation*.12-(1-low)*.025;
      // Each slate sits proud at its exposed lower edge and tucks under the
      // next course. Parallel coplanar plates would flicker in the overlap.
      const at=(t,z,offset=0)=>[p.x+side*p.w/2*(1-t),p.y+p.h*t+lift+.055*(high-t)/(high-low)+offset,p.z+z];
      const a=at(low,za),b=at(low,zb),c=at(high,zb),d=at(high,za);
      quad(a,b,c,d,tone,side);
      // A real exposed lower edge and end faces cast small contact shadows.
      quad(at(low,za,-.045),at(low,zb,-.045),b,a,tone*.69,side);
      quad(d,at(high,za,-.045),at(low,za,-.045),a,tone*.82,side);
      quad(b,at(low,zb,-.045),at(high,zb,-.045),c,tone*.82,side);
    }
  }
  const g=new BufferGeometry();
  g.setAttribute('position',new Float32BufferAttribute(positions,3));
  g.setAttribute('color',new Float32BufferAttribute(colours,3));
  g.computeVertexNormals();return g;
}
