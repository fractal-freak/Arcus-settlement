/**
 * The sound of the valley.
 *
 * WHY IT IS SYNTHESISED AND NOT SAMPLED. Kevin asked for ambience like a
 * channel of ambient music he likes, and said that since this is private the
 * copyright does not matter. It does, and not for the reason that usually gets
 * given: taking audio off YouTube breaks that site's terms whatever you do
 * with it afterwards, and a private page does not make it somebody else's work
 * any less. So this is built rather than borrowed — every sound below is
 * arithmetic, the same way the terrain, the sky, the water and the grass in
 * this world are arithmetic, and there is nothing in it to swap out later.
 * ASSETS.md records what every asset in the project is and where it came from,
 * so if this ever does go anywhere there is a list to check.
 *
 * WHAT IT ACTUALLY DOES. Not a loop. Six layers, each tied to something the
 * world already knows, so what you hear is where you are and what time it is:
 *
 *   wind      always, louder high up and out in the open
 *   river     by how close the camera is to real water
 *   leaves    by how much forest is actually around the camera
 *   birds     by day, sparse, and never twice the same
 *   crickets  by night
 *   drone     a slow chord under everything, turned by the hour
 *
 * A browser will not make a sound until somebody has clicked, so this stays
 * silent and costs nothing until `resume()` is called from a real gesture.
 */

import { groundAt, isWater, smoothHeightAt, GROUND } from './terrain.js';

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

export class Ambience {
  constructor() {
    this.ready = false;
    this.on = false;
    this.level = 0.55;
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
    return true;
  }

  mute() {
    if (!this.ctx) return;
    this.on = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  }

  toggle() { return this.on ? (this.mute(), false) : this.resume(); }

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
    const wet = ctx.createGain(); wet.gain.value = 0.22;
    this.master.connect(ctx.destination);
    this.master.connect(air).connect(wet).connect(ctx.destination);

    const buf = this.noise = noiseBuffer(ctx);
    this.wind = noiseVoice(ctx, buf, { type: 'lowpass', freq: 420, q: 0.7 });
    this.river = noiseVoice(ctx, buf, { type: 'bandpass', freq: 900, q: 0.9 });
    this.leaves = noiseVoice(ctx, buf, { type: 'bandpass', freq: 2400, q: 0.6 });
    this.crickets = noiseVoice(ctx, buf, { type: 'bandpass', freq: 4600, q: 14 });
    for (const v of [this.wind, this.river, this.leaves, this.crickets]) v.gain.connect(this.master);

    // Gusts: the wind's filter and level drift on their own slow cycle, which
    // is the difference between weather and a fan.
    const gust = ctx.createOscillator();
    gust.frequency.value = 0.055;
    const gustDepth = ctx.createGain(); gustDepth.gain.value = 170;
    gust.connect(gustDepth).connect(this.wind.filter.frequency);
    gust.start();

    // Crickets chirp rather than hiss: the band is chopped by a fast tremolo.
    const chirp = ctx.createOscillator();
    chirp.type = 'square';
    chirp.frequency.value = 11;
    const chirpDepth = ctx.createGain(); chirpDepth.gain.value = 0.5;
    chirp.connect(chirpDepth).connect(this.crickets.gain.gain);
    chirp.start();

    // The drone: a fifth and an octave under everything, moving slowly enough
    // that you notice it has changed rather than hearing it change.
    this.drone = ctx.createGain();
    this.drone.gain.value = 0;
    this.drone.connect(this.master);
    this.droneOsc = [];
    for (const [mult, level, detune] of [[1, 0.5, 0], [1.5, 0.28, 4], [2, 0.16, -6], [3, 0.07, 8]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 82.4 * mult;      // low E, and its fifth and octaves
      o.detune.value = detune;
      const g = ctx.createGain(); g.gain.value = level;
      o.connect(g).connect(this.drone);
      o.start();
      this.droneOsc.push(o);
    }

    this.birdAt = 0;
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
    if (!this.ready || !this.on || distance > 42) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const near = Math.max(0, 1 - distance / 42) ** 2;
    const out = ctx.createGain();
    out.gain.value = 0.5 * near;
    out.connect(this.master);

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

  /** One short call by a bird, built out of two sines and gone in half a second. */
  _bird() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const base = 1500 + Math.random() * 1800;
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * (0.55 + Math.random() * 1.1), t + 0.09);
    o.type = 'sine';
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.055, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.3);
    // Most calls are two or three notes, not one.
    if (Math.random() < 0.6) setTimeout(() => this.on && this._bird(), 130 + Math.random() * 180);
  }

  /**
   * Follow the world. `light` is the sky's own 0..1 daylight, `camera` the
   * real camera, `target` where it is looking.
   */
  update(light, camera, target, dtS) {
    if (!this.ready || !this.on) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const set = (p, v, tau = 0.8) => p.setTargetAtTime(v, t, tau);

    const x = target.x, z = target.z;
    const height = clamp((camera.position.y - smoothHeightAt(x, z)) / 60, 0, 1);

    // Wind rises with height and with open ground: a valley floor among the
    // houses is sheltered, a ridge is not.
    const kind = groundAt(Math.round(x), Math.round(z)).kind;
    const open = kind === GROUND.stone || kind === GROUND.snow || kind === GROUND.scrub ? 1 : 0.45;
    set(this.wind.gain.gain, 0.06 + height * 0.13 + open * 0.05);

    // Water, by how much of it is actually near — asked of the terrain, not
    // guessed from a distance to the river's centre line, because the river
    // wanders and there are lakes.
    let wet = 0;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      for (const r of [6, 13, 22]) if (isWater(Math.round(x + Math.cos(a) * r), Math.round(z + Math.sin(a) * r))) wet += 1;
    }
    set(this.river.gain.gain, clamp(wet / 36, 0, 1) * 0.085);

    // Leaves, by how much forest is underfoot.
    let wood = 0;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      const k = groundAt(Math.round(x + Math.cos(a) * 11), Math.round(z + Math.sin(a) * 11)).kind;
      if (k === GROUND.meadow || k === GROUND.grass) wood += 1;
    }
    set(this.leaves.gain.gain, (wood / 8) * 0.035 * (0.3 + light * 0.7));

    // Night belongs to the crickets, and the drone deepens with the dark.
    set(this.crickets.gain.gain, (1 - light) ** 1.6 * 0.022);
    set(this.drone.gain, 0.012 + (1 - light) * 0.018, 3.0);
    for (let i = 0; i < this.droneOsc.length; i++) {
      // The chord drifts a whole tone across the day, so morning and evening
      // do not sound the same.
      this.droneOsc[i].detune.setTargetAtTime(-8 + light * 16 + i * 3, t, 6);
    }

    // Birdsong, by day, sparse. Rolled against real elapsed time so it does
    // not speed up when the frame rate does.
    this.birdAt -= dtS;
    if (this.birdAt <= 0) {
      this.birdAt = 2.5 + Math.random() * 7;
      if (light > 0.35 && Math.random() < light) this._bird();
    }
  }
}
