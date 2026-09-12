/** Character motion in world units. Drawing and input devices live elsewhere. */
import { blocked, walkingHeightAt } from './occupied.js';

export const PLAYER = Object.freeze({ radius: .4, height: 1.75, walk: 2.35, run: 4.8,
  gravity: 18, jump: 6.2, step: .42, coyote: .1, buffer: .14 });
export const angleDelta = (from, to) => Math.atan2(Math.sin(to-from), Math.cos(to-from));

export class PlayerMotion {
  constructor({ solid = blocked, floor = walkingHeightAt } = {}) {
    this.solid = solid; this.floor = floor;
    this.position = { x: 0, y: 0, z: 0 };
    this.reset(0, 0);
  }
  reset(x, z) {
    Object.assign(this.position, { x, y: this.floor(x,z), z });
    this.vx = this.vz = this.vy = this.speed = 0;
    this.heading = Math.PI; this.grounded = true; this.coyote = PLAYER.coyote;
    this.jumpBuffer = this.airTime = this.landing = 0;
  }
  stop() { this.vx = this.vz = this.speed = this.jumpBuffer = 0; }
  jump() { this.jumpBuffer = PLAYER.buffer; }
  update(seconds, { forward = 0, right = 0, yaw = 0, run = false } = {}) {
    const total = Math.max(0, Math.min(seconds, .1));
    const steps = Math.max(1, Math.ceil(total * 120)), dt = total / steps;
    const length = Math.max(1, Math.hypot(forward,right)), pace = run ? PLAYER.run : PLAYER.walk;
    const tx = (-Math.sin(yaw)*forward + Math.cos(yaw)*right) / length * pace;
    const tz = (-Math.cos(yaw)*forward - Math.sin(yaw)*right) / length * pace;
    const p = this.position, startX = p.x, startZ = p.z;
    for (let i=0; i<steps; i++) {
      this.landing = Math.max(0,this.landing-dt);
      this.coyote = this.grounded ? PLAYER.coyote : Math.max(0,this.coyote-dt);
      if (this.jumpBuffer > 0 && this.coyote > 0) {
        this.vy = PLAYER.jump; this.grounded = false; this.coyote = 0;
        this.jumpBuffer = 0; this.airTime = 0; this.landing = 0;
      }
      this.jumpBuffer = Math.max(0,this.jumpBuffer-dt);
      const blend = 1-Math.exp(-(this.grounded ? 18 : 7)*dt);
      this.vx += (tx-this.vx)*blend; this.vz += (tz-this.vz)*blend;
      // Small swept steps prevent sprinting through narrow walls; separate axes slide along them.
      for (const axis of ['x','z']) {
        const v = axis === 'x' ? 'vx' : 'vz', next = p[axis]+this[v]*dt;
        const x = axis === 'x' ? next : p.x, z = axis === 'z' ? next : p.z;
        if (!this.solid(x,z,PLAYER.radius) && this.floor(x,z)-p.y <= PLAYER.step) p[axis] = next;
        else this[v] = 0;
      }
      const ground = this.floor(p.x,p.z);
      if (this.grounded && p.y-ground <= PLAYER.step) p.y = ground;
      else {
        this.grounded = false; this.airTime += dt;
        this.vy -= PLAYER.gravity*dt; p.y += this.vy*dt;
        if (p.y <= ground && this.vy <= 0) {
          p.y = ground; this.vy = 0; this.grounded = true; this.landing = .17;
        }
      }
    }
    this.speed = total ? Math.hypot(p.x-startX,p.z-startZ)/total : 0;
    if (this.speed > .05) {
      const want = Math.atan2(p.x-startX,p.z-startZ);
      this.heading += angleDelta(this.heading,want)*(1-Math.exp(-16*total));
    }
    return this;
  }
}

/** A growing town may occupy yesterday's spawn; only return real clear ground. */
export function safePlayerSpawn(origin, solid = blocked) {
  if (!solid(origin.x,origin.z,PLAYER.radius+.1)) return { ...origin };
  for (let radius=.6; radius<=24; radius+=.6) {
    for (let i=0; i<24; i++) {
      const a=i*Math.PI/12, x=origin.x+Math.sin(a)*radius, z=origin.z+Math.cos(a)*radius;
      if (!solid(x,z,PLAYER.radius+.1)) return { x,z };
    }
  }
  return null;
}
