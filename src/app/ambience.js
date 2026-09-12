/** World-reactive ambience. CC0 recordings and generated foliage, low hum,
 * and work sounds each have a user-controlled gain after their world gain.
 * Audio is created only after a gesture. Sources and edits are in ASSETS.md.
 */

import { groundAt, isWater, smoothHeightAt, GROUND } from './terrain.js';
import { SANCTUARY } from './village.js';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/** Noise, once: two seconds of it, looped, rather than a node per voice. */
function noiseBuffer(ctx, seconds = 2) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // Brown-ish rather than white: white noise is a hiss, and wind is not a hiss.
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

/** One looping noise voice through a filter, with its own gain. */
function noiseVoice(ctx, buf, { type, freq, q = 1, gain = 0 }) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g);
  src.start();
  return { src, filter, gain: g };
}

export const SOUND_LAYERS = [
  ['wind', 'Wind', 0.65], ['river', 'River', 0.8],
  ['leaves', 'Foliage', 0.4], ['birds', 'Birds', 0.25],
  ['crickets', 'Night insects', 0.3], ['drone', 'Low hum', 0],
  ['bowls', 'Singing bowls', 0.3],
  ['work', 'Work sounds', 0.5],
];
const RECORDINGS = ['wind', 'river', 'birds', 'crickets', 'bowls'];

export class Ambience {
  constructor() {
    this.ready = false;
    this.on = false;
    this.level = 0.55;
    this.mix = Object.fromEntries(SOUND_LAYERS.map(([key, , level]) => [key, { level, muted: false }]));
    this.loading = new Set();
    this.failed = new Set();
    this.bowlVoices = new Set();
    this.nextBowlAt = 0;
    this.bowlPresence = 0;
    try {
      const saved = JSON.parse(localStorage.getItem('ambience-mix-v1'));
      if (Number.isFinite(saved?.master)) this.level = clamp(saved.master, 0, 1);
      for (const [key] of SOUND_LAYERS) {
        const v = saved?.layers?.[key];
        if (Number.isFinite(v?.level)) this.mix[key].level = clamp(v.level, 0, 1);
        if (typeof v?.muted === 'boolean') this.mix[key].muted = v.muted;
      }
    } catch { /* Missing or unavailable storage uses defaults. */ }
  }

  /**
   * Start making sound. Must be called from a click or key press — every
   * browser refuses to start an AudioContext any other way, and calling it
   * before then leaves a suspended context sitting there forever.
   */
  resume() {
    if (!this.ready) this._build();
    if (!this.ctx) return false;
    this.ctx.resume();
    this.on = true;
    this.master.gain.setTargetAtTime(this.level, this.ctx.currentTime, 0.6);
    this._tickBowls();
    return true;
  }

  mute() {
    if (!this.ctx) return;
    this.on = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  }

  toggle() { return this.on ? (this.mute(), false) : this.resume(); }

  setLevel(key, value) {
    if (!Number.isFinite(value)) return;
    if (key === 'master') this.level = clamp(value, 0, 1);
    else if (this.mix[key]) {
      this.mix[key].level = clamp(value, 0, 1);
      // Raising a volume slider is an explicit request to hear that layer.
      if (value > 0) this.mix[key].muted = false;
    }
    else return;
    this._applyMix();
  }

  toggleLayer(key) {
    if (!this.mix[key]) return;
    this.mix[key].muted = !this.mix[key].muted;
    this._applyMix();
  }

  resetMix() {
    this.level = 0.55;
    for (const [key, , level] of SOUND_LAYERS) this.mix[key] = { level, muted: false };
    this._applyMix();
  }

  _applyMix() {
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.on ? this.level : 0, t, 0.05);
      for (const [key, v] of Object.entries(this.mix)) {
        this.buses[key].gain.setTargetAtTime(v.muted ? 0 : v.level, t, 0.05);
      }
      this._tickBowls();
    }
    try { localStorage.setItem('ambience-mix-v1', JSON.stringify({ master: this.level, layers: this.mix })); } catch { /* private window */ }
    this.onChange?.();
  }

  async _loadRecording(key) {
    if (this.loading.has(key) || this[key].src || this[key].buffer) return;
    this.failed.delete(key);
    this.loading.add(key);
    this.onChange?.();
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}assets/audio/${key}.mp3`);
      if (!response.ok) throw new Error(`Audio HTTP ${response.status}`);
      const buffer = await this.ctx.decodeAudioData(await response.arrayBuffer());
      if (key === 'bowls') {
        this.bowls.buffer = buffer;
        this._tickBowls();
        return;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(this[key].gain);
      src.start(0, Math.random() * buffer.duration);
      this[key].src = src;
    } catch {
      this.failed.add(key);
    } finally {
      this.loading.delete(key);
      this.onChange?.();
    }
  }

  retryRecordings() {
    for (const key of this.failed) this._loadRecording(key);
  }

  _tickBowls() {
    const mix = this.mix.bowls;
    if (!this.on || !this.level || mix.muted || !mix.level || !this.bowlPresence) {
      this.nextBowlAt = 0;
      return;
    }
    if (!this.bowls?.buffer || this.ctx.currentTime < this.nextBowlAt) return;
    // Use the audio clock, never frame counts or accumulated world time.
    // A resumed background tab plays one strike, not a backlog of notes.
    const t = this.ctx.currentTime;
    this.nextBowlAt = t + 26 + Math.random() * 12;
    if (this.bowlVoices.size >= 3) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.bowls.buffer;
    // Mostly the original bowl, with an occasional higher bell-like answer.
    src.playbackRate.value = Math.random() < 0.25 ? 1.5 : 1;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.7 + Math.random() * 0.15;
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 0.5;
    src.connect(gain).connect(pan).connect(this.bowls.gain);
    this.bowlVoices.add(src);
    src.onended = () => {
      src.disconnect(); gain.disconnect(); pan.disconnect();
      this.bowlVoices.delete(src);
    };
    src.start(t);
  }

  _build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0;

    // A little room on everything, so the valley has a size.
    const air = ctx.createConvolver();
    air.buffer = (() => {
      const len = ctx.sampleRate * 1.4;
      const b = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
      }
      return b;
    })();
    const wet = ctx.createGain(); wet.gain.value = 0.06;
    this.master.connect(ctx.destination);
    this.master.connect(air).connect(wet).connect(ctx.destination);

    this.buses = {};
    for (const [key] of SOUND_LAYERS) {
      const bus = this.buses[key] = ctx.createGain();
      bus.gain.value = this.mix[key].muted ? 0 : this.mix[key].level;
      bus.connect(this.master);
    }
    const buf = this.noise = noiseBuffer(ctx);
    this.leaves = noiseVoice(ctx, buf, { type: 'bandpass', freq: 1800, q: 0.4 });
    this.leaves.gain.connect(this.buses.leaves);
    for (const key of RECORDINGS) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.buses[key]);
      this[key] = { gain };
      this._loadRecording(key);
    }

    // The drone: a fifth and an octave under everything, moving slowly enough
    // that you notice it has changed rather than hearing it change.
    this.drone = ctx.createGain();
    this.drone.gain.value = 0;
    this.drone.connect(this.buses.drone);
    this.droneOsc = [];
    for (const [mult, level, detune] of [[1, 0.5, 0], [1.5, 0.28, 4], [2, 0.16, -6], [3, 0.07, 8]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 110 * mult;      // low A, with harmonics audible on small speakers
      o.detune.value = detune;
      const g = ctx.createGain(); g.gain.value = level;
      o.connect(g).connect(this.drone);
      o.start();
      this.droneOsc.push(o);
    }

    this.ready = true;
  }

  /**
   * A pick hitting stone.
   *
   * Metal on rock is a hard, inharmonic clack with a short ring on top, so:
   * a filtered noise burst for the strike itself and two detuned high sines
   * for the ring, both gone inside a third of a second. Level falls off with
   * how far the camera is from the person swinging, and past forty units it
   * does not play at all — a valley of thirty dig sites all clanking at once
   * would be a workshop, not a landscape.
   */
  clank(distance) {
    if (!this.ready || !this.on || distance > 95) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const near = Math.max(0, 1 - distance / 95) ** 1.6;
    const out = ctx.createGain();
    out.gain.value = 1.5 * near;
    out.connect(this.buses.work);

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600 + Math.random() * 1400;
    bp.Q.value = 2.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    src.connect(bp).connect(g).connect(out);
    src.start(t); src.stop(t + 0.16);

    for (const [f, lvl, len] of [[3100, 0.05, 0.26], [4630, 0.03, 0.19]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * (0.94 + Math.random() * 0.12);
      const og = ctx.createGain();
      og.gain.setValueAtTime(lvl, t + 0.004);
      og.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(og).connect(out);
      o.start(t); o.stop(t + len + 0.02);
    }
  }

  /**
   * Follow the world. `light` is the sky's own 0..1 daylight, `camera` the
   * real camera, `target` where it is looking.
   */
  update(light, camera, target) {
    // Like the river, listen from the ground being viewed, so zooming up
    // above the Stone doesn't move the listener out of its sanctuary.
    const distance = Math.hypot(target.x - SANCTUARY.x, target.z - SANCTUARY.z);
    const fade = clamp((distance - SANCTUARY.r) / (SANCTUARY.r * 2), 0, 1);
    this.bowlPresence = 1 - fade * fade * (3 - 2 * fade);
    if (this.ready) {
      // Existing resonant tails fade too, not just newly scheduled strikes.
      this.bowls.gain.gain.setTargetAtTime(this.bowlPresence, this.ctx.currentTime, 0.35);
    }
    if (!this.ready || !this.on) return;
    this._tickBowls();
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const set = (p, v, tau = 0.8) => p.setTargetAtTime(v, t, tau);

    const x = target.x, z = target.z;
    const height = clamp((camera.position.y - smoothHeightAt(x, z)) / 60, 0, 1);

    // Wind rises with height and with open ground: a valley floor among the
    // houses is sheltered, a ridge is not.
    const kind = groundAt(Math.round(x), Math.round(z)).kind;
    const open = kind === GROUND.stone || kind === GROUND.snow || kind === GROUND.scrub ? 1 : 0.45;
    set(this.wind.gain.gain, 0.3 + height * 0.3 + open * 0.12);

    // Water, by how much of it is actually near — asked of the terrain, not
    // guessed from a distance to the river's centre line, because the river
    // wanders and there are lakes.
    let wet = 0;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      for (const r of [6, 13, 22]) if (isWater(Math.round(x + Math.cos(a) * r), Math.round(z + Math.sin(a) * r))) wet += 1;
    }
    set(this.river.gain.gain, clamp(wet / 36, 0, 1) * 0.9);

    // Leaves, by how much forest is underfoot.
    let wood = 0;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      const k = groundAt(Math.round(x + Math.cos(a) * 11), Math.round(z + Math.sin(a) * 11)).kind;
      if (k === GROUND.meadow || k === GROUND.grass) wood += 1;
    }
    // The filtered noise is already quiet; leave the user a useful range.
    set(this.leaves.gain.gain, (wood / 8) * 0.28 * (0.3 + light * 0.7));

    // Night belongs to the crickets, and the drone deepens with the dark.
    set(this.crickets.gain.gain, (1 - light) ** 1.6 * 0.4);
    set(this.drone.gain, 0.12 + (1 - light) * 0.06, 0.8);
    for (let i = 0; i < this.droneOsc.length; i++) {
      // The chord drifts a whole tone across the day, so morning and evening
      // do not sound the same.
      this.droneOsc[i].detune.setTargetAtTime(-8 + light * 16 + i * 3, t, 6);
    }

    // The recording owns the rhythm; daylight and trees set its presence.
    set(this.birds.gain.gain, clamp((light - 0.2) / 0.8, 0, 1) * (0.25 + wood / 8 * 0.25));
  }
}
