/** Original detailed Gothic kit. All pieces retain the shared collision envelopes. */
import {BoxGeometry,BufferGeometry,Float32BufferAttribute,TorusGeometry,TubeGeometry,CatmullRomCurve3,Vector3} from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
export function masonryGeometry(p){
  const parts=[],alongZ=p.d>p.w,length=alongZ?p.d:p.w,depth=alongZ?p.w:p.d;
  const rows=Math.max(1,Math.ceil(p.h/.48)),course=p.h/rows;
  for(let row=0;row<rows;row++){
    const width=.9,shift=row%2?width/2:0;
    for(let start=-length/2-shift;start<length/2;start+=width){
      const a=Math.max(-length/2,start),b=Math.min(length/2,start+width),span=b-a;
      if(span<.04)continue;
      const weather=Math.abs(Math.sin(p.x*13+p.z*7+start*11+row*23));
      // Erode faces and corners, never remove the support below a retained stone.
      const g=new RoundedBoxGeometry(alongZ?Math.max(.04,depth-.016):span-.014,course-.014,alongZ?span-.014:Math.max(.04,depth-.016),1,Math.min(.028,span*.13,depth*.13));
      if(p.eroded){
        const v=g.attributes.position;
        for(let k=0;k<v.count;k++){
          const x=v.getX(k),y=v.getY(k),z=v.getZ(k),chip=.025*(.5+.5*Math.sin(x*19+y*31+z*17+weather*9));
          v.setXYZ(k,x*(1-chip),y*(1-chip*2),z*(1-chip));
        }
        g.computeVertexNormals();
      }
      g.translate(alongZ?0:(a+b)/2,-p.h/2+(row+.5)*course,alongZ?(a+b)/2:0);parts.push(g);
    }
  }
  const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());return g;
}
export function traceryGeometry(p){
  const parts=[];
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2,g=new TorusGeometry(p.w*.2,.037,8,32).toNonIndexed();
    g.translate(Math.cos(a)*p.w*.18,Math.sin(a)*p.w*.18,0);parts.push(g);
  }
  const outer=new TorusGeometry(p.w*.43,.055,10,48).toNonIndexed();parts.push(outer);
  const geo=mergeGeometries(parts);parts.forEach(g=>g.dispose());geo.translate(p.x,p.y,p.z);return geo;
}
export function flyingGeometry(p){
  const path=new CatmullRomCurve3([new Vector3(-p.w/2,0,0),new Vector3(-p.w*.25,p.h*.65,0),new Vector3(p.w*.2,p.h*.9,0),new Vector3(p.w/2,p.h,0)]);
  const geo=new TubeGeometry(path,32,.23,12,false).toNonIndexed();geo.translate(p.x,p.y,p.z);return geo;
}

/** Individually overlapping slate courses, with gaps and raised exposed edges. */
export function slateSpireGeometry(p){
  const positions=[],rows=Math.ceil(p.h/.26),height=p.h/rows;
  const radius=t=>p.w/2*Math.pow(Math.max(0,1-t),.88);
  const tri=(a,b,c)=>positions.push(...a,...b,...c);
  for(let row=0;row<rows;row++){
    const y=row*height,r=radius(row/rows),next=radius((row+1)/rows),count=Math.max(8,Math.ceil(2*Math.PI*r/.34));
    for(let tile=0;tile<count;tile++){
      if(row>3 && row<rows-3 && (tile*17+row*31)%223===0)continue;
      const a=(tile+(row%2)*.5)/count*Math.PI*2+.003,b=(tile+1+(row%2)*.5)/count*Math.PI*2-.003;
      const point=(angle,rad,yy)=>[p.x+Math.sin(angle)*rad,p.y+yy,p.z+Math.cos(angle)*rad];
      const A=point(a,r+.025,y),B=point(b,r+.025,y),C=point(b,next+.018,y+height+.018),D=point(a,next+.018,y+height+.018);
      tri(A,B,D);tri(B,C,D);
      const E=point(a,r-.005,y-.035),F=point(b,r-.005,y-.035);tri(E,F,A);tri(F,B,A);
    }
  }
  const geo=new BufferGeometry();geo.setAttribute('position',new Float32BufferAttribute(positions,3));geo.computeVertexNormals();return geo;
}
