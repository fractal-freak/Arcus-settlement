/** Authored, licensed wildlife. Geometry, skinning and gait come from the source models. */
import { Group, Box3, Vector3, AnimationMixer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { WILDLIFE } from '../app/enchantment.js';
import { blocked, walkingHeightAt } from '../app/occupied.js';
import { hash2 } from '../app/terrain.js';
const assets={
  'elder-stag':{file:'stag',height:2.4,idle:'Idle',graze:'Graze',move:'Run',head:'Head',hip:'Hip',speed:1.7},
  'young-doe':{file:'doe',height:1.65,idle:'Idle',graze:'Graze',move:'Run',head:'Head',hip:'Hip',speed:1.5},
  'woodland-fox':{file:'fox',height:.65,idle:'Survey',graze:'Survey',move:'Walk',head:'b_Head_05',hip:'b_Hip_01',speed:.7},
};
export class Wildlife3D{
  constructor(parent){
    this.animals=[];this.lastTime=null;this.errors=[];
    const loader=new GLTFLoader();
    this.ready=Promise.all(WILDLIFE.map(async spec=>{
      const config=assets[spec.id];if(!config)return;
      try{
        const gltf=await loader.loadAsync(`${import.meta.env.BASE_URL}assets/wildlife/${config.file}.glb`);
        const model=gltf.scene,mixer=new AnimationMixer(model);
        const actions=Object.fromEntries(gltf.animations.map(clip=>[clip.name,mixer.clipAction(clip)]));
        if(!actions[config.idle]||!actions[config.move])throw new Error(`Missing required clips in ${config.file}`);
        actions[config.idle].play();mixer.update(0);model.updateMatrixWorld(true);
        model.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();if(o.isMesh){o.castShadow=true;o.receiveShadow=true;for(const m of Array.isArray(o.material)?o.material:[o.material]){if(m.map)m.map.anisotropy=4;}}});
        // Read actual head/hip world positions; do not assume the export's facing axis.
        const head=model.getObjectByName(config.head),hip=model.getObjectByName(config.hip);
        const facing=head.getWorldPosition(new Vector3()).sub(hip.getWorldPosition(new Vector3()));
        const pivot=new Group();pivot.add(model);pivot.rotation.y=-Math.atan2(facing.x,facing.z);pivot.updateMatrixWorld(true);
        const box=new Box3().setFromObject(pivot,true),size=box.getSize(new Vector3()),center=box.getCenter(new Vector3());
        const scale=config.height/size.y;
        const root=new Group(),normalized=new Group();normalized.add(pivot);normalized.scale.setScalar(scale);
        normalized.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);root.add(normalized);
        root.name=spec.id;root.position.set(spec.x,walkingHeightAt(spec.x,spec.z),spec.z);root.rotation.y=spec.phase;
        parent.add(root);
        const a={spec,config,root,model,mixer,actions,action:config.idle,nextDecision:0,target:null,seed:this.animals.length,
          measured:{sourceSize:size.toArray(),scale,forward:facing.toArray(),clips:gltf.animations.map(c=>({name:c.name,duration:c.duration}))}};
        this.animals.push(a);
      }catch(error){this.errors.push(String(error));console.error('Wildlife load failed:',error);}
    }));
  }
  play(a,name){
    if(a.action===name)return;
    a.actions[a.action]?.fadeOut(.3);a.actions[name].reset().fadeIn(.3).play();a.action=name;
  }
  tick(time){
    const dt=this.lastTime===null?0:Math.min(.1,Math.max(0,time-this.lastTime));this.lastTime=time;
    for(const a of this.animals){
      if(time>=a.nextDecision){
        const cycle=Math.floor(time/12),angle=hash2(cycle,a.seed,4101)*Math.PI*2;
        // Quiet grazing dominates; occasional short moves use the authored locomotion clip.
        if(cycle%3===2){
          const target={x:a.spec.x+Math.cos(angle)*2.2,z:a.spec.z+Math.sin(angle)*2.2};
          let clear=true;const p=a.root.position;
          for(let s=0;s<=1;s+=.05)if(blocked(p.x+(target.x-p.x)*s,p.z+(target.z-p.z)*s,.35))clear=false;
          a.target=clear?target:null;
        }else a.target=null;
        a.nextDecision=time+12;
        this.play(a,a.target?a.config.move:cycle%2?a.config.idle:a.config.graze);
      }
      if(a.target){
        const p=a.root.position,dx=a.target.x-p.x,dz=a.target.z-p.z,distance=Math.hypot(dx,dz),step=Math.min(distance,a.config.speed*dt);
        if(distance<.04){a.target=null;this.play(a,a.config.idle);}
        else{
          const x=p.x+dx/distance*step,z=p.z+dz/distance*step;
          if(blocked(x,z,.35)){a.target=null;this.play(a,a.config.idle);}
          else{p.set(x,walkingHeightAt(x,z),z);a.root.rotation.y=Math.atan2(dx,dz);}
        }
      }
      a.mixer.update(dt);
    }
  }
}
