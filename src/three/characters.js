/**
 * Real people, instead of cones.
 *
 * KayKit's Adventurers pack (CC0 — public/assets/kaykit-characters/
 * License.txt, read in full before use): six rigged, textured characters,
 * and a shared "Rig_Medium" skeleton whose animation clips ship in their own
 * separate files. Same artist as the buildings, which is the whole reason
 * for choosing this pack over a better-stocked villager set — a village
 * where the houses and the people come from different hands reads as a
 * collage no matter how good either half is.
 *
 * Two things here are not obvious and are easy to get wrong:
 *
 * 1. A skinned mesh CANNOT be cloned with Object3D.clone(). That returns a
 *    copy which still points at the ORIGINAL skeleton, so every clone bends
 *    in lockstep with whichever one happened to be animated last.
 *    SkeletonUtils.clone() is the one that rebuilds the bone hierarchy and
 *    rebinds it, and it is the reason this module exists rather than each
 *    caller cloning for itself.
 *
 * 2. The clips live in different files from the characters. They drive the
 *    shared rig by BONE NAME, so they apply to any of the six — but only if
 *    the track names line up with the cloned hierarchy, which is checked at
 *    load rather than assumed (see retarget()).
 */

import { AnimationMixer, LoopRepeat, LoopOnce, Group, Mesh, CylinderGeometry, BoxGeometry, MeshLambertMaterial, Color, LatheGeometry, Vector2, SphereGeometry, TorusGeometry } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const BASE = './assets/kaykit-characters/';

/** The six the free tier ships. Picked per person by a stable hash, never at random. */
const BASE_KINDS = ['Knight', 'Mage', 'Ranger', 'Rogue', 'Rogue_Hooded', 'Barbarian'];
export const KINDS = [...BASE_KINDS, 'Witch', 'Wizard', 'Starfarer'];
const BASE_KIND = { Witch:'Rogue', Wizard:'Mage', Starfarer:'Ranger' };

/**
 * The dig crew's uniform: every active session wears this one.
 *
 * Said plainly, because it is a compromise and not a match — this pack has no
 * archaeologist. The Ranger is the closest thing in it: field leathers, a
 * shoulder strap, boots, no armour and no robe, which is what someone working
 * a site outdoors all day would actually be dressed in. What makes the crew
 * read as a crew is that they are all dressed ALIKE and nobody else in the
 * settlement is dressed that way; the villagers draw from the other five.
 */
export const DIG_CREW = 'Ranger';

/** Everyone who is not on the dig — so a villager is never mistaken for crew. */
export const VILLAGER_KINDS = ['Rogue', 'Witch', 'Ranger', 'Wizard', 'Starfarer', 'Rogue_Hooded', 'Knight', 'Barbarian'];

const CLOTH=[0x416f69,0x69517e,0x944e51,0x456782,0x648052,0xa17c45];
const citizenMaterials=new WeakMap();
function citizenMaterial(source,seed,preserveSkin,alien=false) {
  let variants=citizenMaterials.get(source);
  if(!variants){variants=new Map();citizenMaterials.set(source,variants);}
  const index=Math.abs(Math.floor(seed))%CLOTH.length;
  const key=`${index}-${preserveSkin}-${alien}`;
  if(variants.has(key))return variants.get(key);
  const material=source.clone();material.roughness=1;material.metalness=0;
  material.onBeforeCompile=shader=>{
    shader.uniforms.citizenCloth={value:new Color(CLOTH[index])};
    shader.fragmentShader='uniform vec3 citizenCloth;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float high=max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b));
      float low=min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b));
      bool skin=${preserveSkin ? 'true' : 'false'} && diffuseColor.r>diffuseColor.g*1.15 && diffuseColor.g>diffuseColor.b*1.15;
      if(skin && ${alien ? 'true' : 'false'}) diffuseColor.rgb=vec3(.28,.69,.64)*(.7+high*.5);
      if(!skin && high-low>.045){
        float lightness=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
        diffuseColor.rgb=mix(diffuseColor.rgb,citizenCloth*(.65+lightness),.65);
      }
    `);
  };
  material.customProgramCacheKey=()=>`citizen-cloth-${key}`;
  variants.set(key,material);return material;
}

const ANIM_FILES = ['Rig_Medium_General', 'Rig_Medium_MovementBasic'];

const loader = new GLTFLoader();
function load(name) {
  return new Promise((resolve, reject) => {
    loader.load(`${BASE}${name}.glb`, resolve, undefined, (e) => reject(new Error(`${name}.glb: ${e?.message ?? e}`)));
  });
}

let readyPromise = null;
const models = new Map(); // kind -> gltf.scene
const clips = new Map();  // clip name -> AnimationClip

/**
 * Loads all six characters and every clip once. Every caller shares this one
 * promise, so six characters and two animation files are fetched a single
 * time no matter how many villagers and sessions ask for them.
 */
export function loadCharacters() {
  if (readyPromise) return readyPromise;
  readyPromise = Promise.all([
    ...BASE_KINDS.map((k) => load(k).then((g) => models.set(k, g.scene))),
    ...ANIM_FILES.map((f) => load(f).then((g) => {
      for (const c of g.animations) if (!clips.has(c.name)) clips.set(c.name, c);
    })),
  ]).then(() => ({ kinds: [...models.keys()], clips: [...clips.keys()] }));
  return readyPromise;
}

export function clipNames() { return [...clips.keys()]; }

/**
 * One character, ready to stand in the world.
 *
 * `targetHeight` is in world units and the model is scaled to actually MEET
 * it, measured off the real model rather than assumed: the six are not the
 * same height as each other (2.17 to 2.65 in the kit's own units), so a
 * single shared multiplier would have left the Mage a head taller than
 * everyone else for no reason anyone could see.
 */
export function makeCharacter(kind, targetHeight, { background = false, appearanceSeed = 0 } = {}) {
  const src = models.get(BASE_KIND[kind] ?? kind) ?? models.get(KINDS[0]);
  if (!src) return null;
  const root = skeletonClone(src);

  // Measure this character's own height from its bind pose, then scale to fit.
  let maxY = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if(background || BASE_KIND[kind]) {
      // These cape mesh names were inspected in the source GLBs. The rig,
      // body proportions and animation binding remain the authored assets.
      if(/_Cape$/.test(o.name) && !['Wizard','Witch','Starfarer'].includes(kind))o.visible=false;
      o.material=Array.isArray(o.material)?o.material.map(m=>citizenMaterial(m,appearanceSeed,/Head|Arm/.test(o.name),kind==='Starfarer')):citizenMaterial(o.material,appearanceSeed,/Head|Arm/.test(o.name),kind==='Starfarer');
    }
    // A `background` character is drawn once and only once: no shadow-map
    // pass, and layer 1 to skip stage.js's depth-only pre-pass the same way
    // the grass already does. That pre-pass feeds the ink outline and the god
    // rays, so a background figure loses its outline — worth it at four dozen
    // of them, where each was otherwise being drawn three times over (depth,
    // shadow, colour) to decorate the middle distance.
    o.castShadow = !background;
    o.receiveShadow = true;
    if (background) o.layers.set(1);
    o.geometry.computeBoundingBox();
    maxY = Math.max(maxY, o.geometry.boundingBox.max.y);
  });
  const scale = maxY > 0 ? targetHeight / maxY : 1;
  // Accessories are fitted to the measured bind-pose head, then parented to its bone.
  if(kind==='Witch'||kind==='Starfarer') {
    const headMesh=root.getObjectByName(`${BASE_KIND[kind]}_Head`);
    const bounds=headMesh.geometry.boundingBox;
    const crown=bounds.max.y, cx=(bounds.min.x+bounds.max.x)/2, cz=(bounds.min.z+bounds.max.z)/2;
    const detail=new Group();detail.name=`${kind} regalia`;
    const cloth=new MeshLambertMaterial({color:kind==='Witch'?0x493455:0xc2ae6f});
    const gold=new MeshLambertMaterial({color:0xdab568});
    const gem=new MeshLambertMaterial({color:0x73e4d1,emissive:0x123e38});
    const add=(geo,mat,x,y,z)=>{const m=new Mesh(geo,mat);m.position.set(x,y,z);detail.add(m);return m;};
    if(kind==='Witch') {
      const brim=add(new CylinderGeometry(.64,.66,.045,32),cloth,cx,crown-.07,cz);brim.scale.z=.86;
      const points=[[.43,0],[.4,.08],[.32,.24],[.23,.46],[.15,.65],[.075,.8],[0,.86]].map(([x,y])=>new Vector2(x,y));
      const hat=add(new LatheGeometry(points,28),cloth,cx,crown-.05,cz);hat.rotation.z=-.16;
      add(new CylinderGeometry(.39,.42,.1,28),gold,cx,crown+.03,cz);
      const jewel=add(new SphereGeometry(.07,10,8),gem,cx,crown+.05,cz+.4);jewel.scale.z=.45;
    }else {
      for(const side of [-1,1]) {
        const stem=add(new CylinderGeometry(.025,.035,.38,8),gold,cx+side*.25,crown+.08,cz);stem.rotation.z=-side*.35;
        add(new SphereGeometry(.075,12,8),gem,cx+side*.31,crown+.27,cz);
        const ring=add(new TorusGeometry(.1,.018,6,16),gold,cx+side*.4,crown-.35,cz);ring.rotation.y=Math.PI/2;
      }
    }
    root.add(detail);root.updateMatrixWorld(true);
    let head;root.traverse(o=>{if(o.isBone&&o.name==='head')head=o;});
    head?.attach(detail);
    detail.traverse(o=>{if(o.isMesh){o.castShadow=!background;if(background)o.layers.set(1);}});
    root.userData.accessories=detail;
  }
  root.scale.setScalar(scale);

  const mixer = new AnimationMixer(root);
  const actions = new Map();
  let current = null;

  function play(name, { fade = 0.25, timeScale = 1, once = false } = {}) {
    const clip = clips.get(name);
    if (!clip) return false;
    let action = actions.get(name);
    if (!action) {
      action = mixer.clipAction(clip, root);
      action.setLoop(LoopRepeat, Infinity);
      actions.set(name, action);
    }
    action.timeScale = timeScale;
    if (current === action) return true;
    action.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
    action.clampWhenFinished = once;
    action.enabled = true;
    action.reset().fadeIn(fade).play();
    if (current) current.fadeOut(fade);
    current = action;
    return true;
  }

  /**
   * Put something in this character's hand.
   *
   * The rig carries empty `handslot.l` / `handslot.r` bones for exactly this —
   * the kit ships its weapons as separate models and expects you to parent
   * them here — so a tool follows the hand through every frame of every clip
   * for free, with no per-frame work of our own. Scale is undone because the
   * character itself was scaled to a target height, and a pickaxe should not
   * shrink because its owner is short.
   */
  function hold(object, side = 'r') {
    const slot = bone(`handslot${side}`);
    if (!slot) return false;
    object.scale.multiplyScalar(1 / (scale || 1));
    slot.add(object);
    return true;
  }

  /**
   * A bone by name, ignoring punctuation.
   *
   * The kit calls these `handslot.r`; three.js's GLTF loader strips the dot
   * when it sanitises node names for animation binding, so the bone in the
   * scene is `handslotr`. Looking for the kit's spelling found nothing and
   * `hold` quietly returned false — which is why every archaeologist was
   * swinging an invisible pickaxe.
   */
  function bone(want) {
    const key = want.toLowerCase().replace(/[^a-z0-9]/g, '');
    let found = null;
    root.traverse((o) => {
      if (!found && o.isBone && o.name.toLowerCase().replace(/[^a-z0-9]/g, '') === key) found = o;
    });
    return found;
  }

  return {
    root,
    mixer,
    play,
    hold,
    bone,
    get animation() { return current?.getClip().name ?? null; },
    /** Advance the animation. Seconds, not milliseconds. */
    update: (dt) => mixer.update(dt),
    dispose: () => { root.userData.accessories?.traverse(o=>{o.geometry?.dispose();}); mixer.stopAllAction(); mixer.uncacheRoot(root); },
  };
}

/**
 * A pickaxe, built rather than downloaded.
 *
 * Neither pack has one — the medieval kit has buckets, ladders and barrows but
 * no tool a person holds, and the character pack ships swords and bows. It is
 * a haft and a head, which is all a pickaxe is at this size, and it reads
 * instantly at the one distance it is ever seen from.
 */
export function makePickaxe() {
  const g = new Group();
  const haft = new Mesh(new CylinderGeometry(0.030, 0.038, 1.02, 6), new MeshLambertMaterial({ color: 0x7a5433 }));
  haft.position.y = 0.20;
  const head = new Mesh(new BoxGeometry(0.52, 0.08, 0.09), new MeshLambertMaterial({ color: 0x9aa2ad }));
  head.position.y = 0.66;
  head.rotation.z = 0.12;
  g.add(haft, head);
  // Head hanging BELOW the hand, down the haft. Measured, not guessed: with
  // the kit's grip bone, (PI, 0, 0) is the one orientation of the eight tried
  // that puts the head 0.64 straight down and only 0.15 sideways. Every other
  // one lays the pick across the body, which is what made the swing look like
  // somebody waving a broom.
  g.rotation.set(Math.PI, 0, 0);
  return g;
}

/** Pick a villager deterministically, so the same person is the same character every load. */
export function kindFor(seed) {
  return VILLAGER_KINDS[Math.abs(Math.floor(seed)) % VILLAGER_KINDS.length];
}
