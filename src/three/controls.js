/**
 * The camera rig.
 *
 * OrbitControls does the hard part — damping, panning on the ground plane,
 * touch gestures — and one thing is added on top: THE TILT FOLLOWS THE ZOOM.
 *
 * Close in, the camera drops toward the ground and you are looking across the
 * world at eye level with the sky behind it. Pulled back, it rises to a
 * bird's-eye view of the whole settlement. That coupling is what makes one
 * control do both jobs, and it happens only while zooming: the moment you orbit
 * by hand your angle is yours until you touch the wheel again.
 *
 * Dragging pans. Orbiting is the right button, or shift-drag, because
 * translating across the ground is the thing you want ninety times out of a
 * hundred and it should not need a modifier.
 */

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MOUSE, TOUCH, Vector3 } from 'three';

/** Polar angle is measured from straight down. Bigger means closer to the ground. */
const ANGLE_NEAR = 1.30;   // ~75°, a low look across the land
const ANGLE_FAR = 0.52;    // ~30°, looking down on the settlement

export class Rig {
  constructor(camera, domElement) {
    const c = new OrbitControls(camera, domElement);
    this.controls = c;
    this.camera = camera;

    c.enableDamping = true;
    c.dampingFactor = 0.05;
    c.minDistance = 12;
    c.maxDistance = 150;
    c.minPolarAngle = 0.12;
    c.maxPolarAngle = Math.PI / 2 - 0.05; // never under the ground horizon
    // Pan across the ground plane, not across the screen.
    c.screenSpacePanning = false;
    c.panSpeed = 1.0;
    c.rotateSpeed = 0.75;
    c.zoomSpeed = 0.9;

    c.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
    c.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_ROTATE };

    c.target.set(0, 1.1, 0);

    // Auto-tilt is on until the user orbits, and comes back when they zoom.
    this.autoTilt = true;
    domElement.addEventListener('wheel', () => { this.autoTilt = true; }, { passive: true });
    domElement.addEventListener('pointerdown', (e) => {
      if (e.button === 2 || e.shiftKey) this.autoTilt = false;
    });

    this._v = new Vector3();
  }

  get target() { return this.controls.target; }
  get distance() { return this.camera.position.distanceTo(this.controls.target); }

  /** The angle this distance wants, eased so a wheel flick does not snap. */
  angleForDistance(d) {
    const t = Math.min(1, Math.max(0, (d - this.controls.minDistance) / (140 - this.controls.minDistance)));
    const s = t * t * (3 - 2 * t);
    return ANGLE_NEAR + (ANGLE_FAR - ANGLE_NEAR) * s;
  }

  setDistance(d, angle) {
    const c = this.controls;
    const dist = Math.min(c.maxDistance, Math.max(c.minDistance, d));
    const polar = angle ?? this.angleForDistance(dist);
    const az = Math.atan2(
      this.camera.position.x - c.target.x,
      this.camera.position.z - c.target.z,
    ) || Math.PI * 0.25;
    this.camera.position.set(
      c.target.x + Math.sin(polar) * Math.sin(az) * dist,
      c.target.y + Math.cos(polar) * dist,
      c.target.z + Math.sin(polar) * Math.cos(az) * dist,
    );
    c.update();
  }

  update(dtMs) {
    const c = this.controls;
    if (this.autoTilt) {
      const d = this.distance;
      const want = this.angleForDistance(d);
      const sph = this._v.copy(this.camera.position).sub(c.target);
      const polar = Math.acos(Math.min(1, Math.max(-1, sph.y / sph.length())));
      const diff = want - polar;
      if (Math.abs(diff) > 0.002) {
        // Frame-rate independent ease toward the angle this zoom level wants.
        const k = 1 - Math.pow(0.002, dtMs / 1000);
        const az = Math.atan2(sph.x, sph.z);
        const next = polar + diff * k;
        this.camera.position.set(
          c.target.x + Math.sin(next) * Math.sin(az) * d,
          c.target.y + Math.cos(next) * d,
          c.target.z + Math.sin(next) * Math.cos(az) * d,
        );
      }
    }
    c.update();
  }
}
