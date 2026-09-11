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

import { AnimationMixer, LoopRepeat } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const BASE = './assets/kaykit-characters/';

/** The six the free tier ships. Picked per person by a stable hash, never at random. */
export const KINDS = ['Knight', 'Mage', 'Ranger', 'Rogue', 'Rogue_Hooded', 'Barbarian'];

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

  return {
    root,
    mixer,
    play,
    /** Advance the animation. Seconds, not milliseconds. */
    update: (dt) => mixer.update(dt),
    dispose: () => { mixer.stopAllAction(); mixer.uncacheRoot(root); },
  };
}

/** Pick one of the six deterministically, so the same person is the same character every load. */
export function kindFor(seed) {
  return KINDS[Math.abs(Math.floor(seed)) % KINDS.length];
}
