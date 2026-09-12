import { Wildlife3D } from './wildlife3d.js';
import { ArcaneFire3D } from './arcaneFire3d.js';
import { JUPITER_GLYPH } from '../data/jupiterGlyph.js';
/** Original stained-glass craft, weathered fabric, arcane fire, and woodland animals. */
import {Group,Mesh,PlaneGeometry,SphereGeometry,CylinderGeometry,MeshStandardMaterial,MeshPhysicalMaterial,MeshBasicMaterial,CanvasTexture,DoubleSide,SRGBColorSpace,PointLight,Vector3,Shape,ShapeGeometry} from 'three';
import {BANNERS,GLASS,FIRES,WILDLIFE} from '../app/enchantment.js';
import {smoothHeightAt} from '../app/terrain.js';
import {blocked} from '../app/occupied.js';
function bannerTexture(color){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#'+color.toString(16).padStart(6,'0');ctx.fillRect(0,0,128,256);
  ctx.strokeStyle='#c8ae75';ctx.lineWidth=3;ctx.strokeRect(9,8,110,238);
  const glyph=JUPITER_GLYPH,scale=70/(glyph.maxY-glyph.minY);
  ctx.save();ctx.translate(64-(glyph.minX+glyph.maxX)*scale/2,125+glyph.minY*scale);ctx.scale(scale,-scale);
  ctx.fillStyle='#e6c574';ctx.fill(new Path2D(glyph.d));ctx.restore();
  for(let i=0;i<250;i++){ctx.fillStyle='rgba(40,30,35,.12)';ctx.fillRect((i*71)%128,(i*43)%256,1,8);}
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;return texture;
}
function glassTexture(index){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;
  const ctx=canvas.getContext('2d'),colors=['#3867a4','#b94062','#d8a94e','#3b9d83','#7355ad'];
  ctx.fillStyle='#202737';ctx.fillRect(0,0,128,256);
  for(let row=-1;row<10;row++)for(let col=-1;col<5;col++){
    const x=col*36+(row%2)*18,y=row*30;
    ctx.beginPath();ctx.moveTo(x,y-28);ctx.lineTo(x+17,y);ctx.lineTo(x,y+28);ctx.lineTo(x-17,y);ctx.closePath();
    ctx.fillStyle=colors[(row+col+index+30)%colors.length];ctx.fill();ctx.strokeStyle='#252b32';ctx.lineWidth=2;ctx.stroke();
  }
  ctx.strokeStyle='#ecd59c';ctx.lineWidth=3;ctx.beginPath();ctx.arc(64,108,29,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();for(let i=0;i<11;i++){const a=i*Math.PI*4/5-Math.PI/2;ctx.lineTo(64+25*Math.cos(a),108+25*Math.sin(a));}ctx.stroke();
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;return texture;
}
export class Enchantment3D {
  constructor(scene){
    this.group=new Group();this.group.name='Old kingdom enchantments';scene.add(this.group);this.flags=[];this.flames=[];this.animals=[];
    for(const b of BANNERS){
      const geo=new PlaneGeometry(b.w,b.h,12,22),p=geo.attributes.position;
      for(let i=0;i<p.count;i++)if(p.getY(i)<-b.h*.43)p.setY(i,p.getY(i)+(.5+.5*Math.sin(p.getX(i)*22))*.32);
      const mesh=new Mesh(geo,new MeshStandardMaterial({map:bannerTexture(b.color),roughness:.94,side:DoubleSide}));mesh.position.set(b.x,b.y-b.h/2,b.z);mesh.castShadow=true;this.group.add(mesh);
      this.flags.push({mesh,base:p.array.slice(),h:b.h});
      const rail=new Mesh(new CylinderGeometry(.04,.04,b.w+.3,8),new MeshStandardMaterial({color:0xbd9b59,metalness:.65,roughness:.4}));rail.rotation.z=Math.PI/2;rail.position.set(b.x,b.y,b.z);this.group.add(rail);

    }
    for(const g of GLASS){
      const shape=new Shape();shape.moveTo(-g.w/2,0);shape.lineTo(g.w/2,0);shape.lineTo(g.w/2,g.h*.63);shape.quadraticCurveTo(g.w*.45,g.h*.85,0,g.h);shape.quadraticCurveTo(-g.w*.45,g.h*.85,-g.w/2,g.h*.63);shape.closePath();
      const geometry=new ShapeGeometry(shape,18),p=geometry.attributes.position,uv=geometry.attributes.uv;
      for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/g.w+.5,p.getY(i)/g.h);
      const map=glassTexture(g.palette),mesh=new Mesh(geometry,new MeshPhysicalMaterial({map,emissiveMap:map,emissive:0xffffff,emissiveIntensity:.22,roughness:.08,metalness:0,transmission:.62,thickness:.055,attenuationDistance:2.5,ior:1.52,clearcoat:1,clearcoatRoughness:.08,envMapIntensity:1.5,side:DoubleSide}));
      mesh.position.set(g.x,g.y,g.z);this.group.add(mesh);
    }
    for(const spec of FIRES){const fire=new ArcaneFire3D(spec);this.group.add(fire.group);this.flames.push(fire);}
    this.wildlife=new Wildlife3D(this.group);this.animals=this.wildlife.animals;
  }
  tick(t){
    for(const {mesh,base,h} of this.flags){const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){const drop=(h/2-base[i*3+1])/h;p.setZ(i,base[i*3+2]+Math.sin(t*1.6+base[i*3]*3+drop*4)*.15*drop);}p.needsUpdate=true;mesh.geometry.computeVertexNormals();}
    for(const fire of this.flames)fire.tick(t);
    this.wildlife.tick(t);
  }
}
