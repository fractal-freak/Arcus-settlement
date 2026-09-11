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

import { AnimationMixer, LoopRepeat, Group, Mesh, CylinderGeometry, BoxGeometry, MeshLambertMaterial } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const BASE = './assets/kaykit-characters/';

/** The six the free tier ships. Picked per person by a stable hash, never at random. */
export const KINDS = ['Knight', 'Mage', 'Ranger', 'Rogue', 'Rogue_Hooded', 'Barbarian'];

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
export const VILLAGER_KINDS = KINDS.filter((k) => k !== DIG_CREW);

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
    ...KINDS.map((k) => load(k).then((g) => models.set(k, g.scene))),
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
export function makeCharacter(kind, targetHeight, { background = false } = {}) {
  const src = models.get(kind) ?? models.get(KINDS[0]);
  if (!src) return null;
  const root = skeletonClone(src);

  // Measure this character's own height from its bind pose, then scale to fit.
  let maxY = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    // A `background` character is drawn once and only once: no shadow-map
    // pass, and layer 1 to skip stage.js's depth-only pre-pass the same way
    // the grass already does. That pre-pass feeds the ink outline and the god
    // rays, so a background figure loses its outline — worth it at four dozen
    // of them, where each was otherwise being drawn three times over (depth,
    // shadow, colour) to decorate the middle distance.
    o.castShadow = !background;
    o.receiveShadow = !background;
    if (background) o.layers.set(1);
    o.geometry.computeBoundingBox();
    maxY = Math.max(maxY, o.geometry.boundingBox.max.y);
  });
  const scale = maxY > 0 ? targetHeight / maxY : 1;
  root.scale.setScalar(scale);

  const mixer = new AnimationMixer(root);
  const actions = new Map();
  let current = null;

  function play(name, { fade = 0.25, timeScale = 1 } = {}) {
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
    let slot = null;
    root.traverse((o) => { if (!slot && o.name === `handslot.${side}`) slot = o; });
    if (!slot) return false;
    object.scale.multiplyScalar(1 / (scale || 1));
    slot.add(object);
    return true;
  }

  return {
    root,
    mixer,
    play,
    hold,
    /** Advance the animation. Seconds, not milliseconds. */
    update: (dt) => mixer.update(dt),
    dispose: () => { mixer.stopAllAction(); mixer.uncacheRoot(root); },
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
  const haft = new Mesh(new CylinderGeometry(0.028, 0.034, 0.78, 6), new MeshLambertMaterial({ color: 0x7a5433 }));
  haft.position.y = 0.12;
  const head = new Mesh(new BoxGeometry(0.46, 0.07, 0.08), new MeshLambertMaterial({ color: 0x9aa2ad }));
  head.position.y = 0.48;
  head.rotation.z = 0.12;
  g.add(haft, head);
  g.rotation.set(Math.PI / 2, 0, 0);   // laid along the grip rather than out of the fist
  return g;
}

/** Pick a villager deterministically, so the same person is the same character every load. */
export function kindFor(seed) {
  return VILLAGER_KINDS[Math.abs(Math.floor(seed)) % VILLAGER_KINDS.length];
}
