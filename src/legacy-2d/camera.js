/**
 * The camera. Strictly orthographic.
 *
 * An earlier version bent the ground through a tanh to fake a horizon, and
 * narrowed it with distance. It bought a pretty sky and cost far too much: tile
 * geometry changed shape across the screen, the world swam under the cursor
 * while dragging, and zoom pulled toward the middle instead of toward the
 * pointer. None of that is worth a backdrop.
 *
 * So: one uniform scale, everywhere, always. A tile is the same size and shape
 * at the top of the screen as at the bottom. Panning is a translation on the
 * grid plane and nothing else. There is no rotation, no pitch and no skew here,
 * and none anywhere else either — the canvas carries no CSS transform.
 */

export class Camera {
  constructor(screenW, screenH) {
    // Where the camera is looking, and where it is gliding to. Dragging moves
    // the target; the camera eases after it, which is what takes the judder out
    // of a trackpad without adding any lag you can feel.
    this.x = 0; this.y = 0;
    this.tx = 0; this.ty = 0;
    this.zoom = 1;
    this.tzoom = 1;
    this.minZoom = 0.28;
    this.maxZoom = 2.6;
    this.resize(screenW, screenH);
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.ox = w / 2;
    this.oy = h / 2;
  }

  /**
   * World to screen. Uniform scale, no distance terms.
   *
   * `k` is returned for callers that size things standing on the ground. In an
   * orthographic view it is always 1 — kept so the call sites do not have to
   * care which projection they are drawing under.
   */
  project(wx, wy) {
    return {
      x: this.ox + (wx - this.x) * this.zoom,
      y: this.oy + (wy - this.y) * this.zoom,
      k: 1,
    };
  }

  /** Screen back to world, which is what anchors the zoom to the pointer. */
  unproject(sx, sy) {
    return {
      x: this.x + (sx - this.ox) / this.zoom,
      y: this.y + (sy - this.oy) / this.zoom,
    };
  }

  /** Exactly the rectangle of grid plane the screen covers. */
  visibleBounds() {
    const hw = this.ox / this.zoom;
    const hh = this.oy / this.zoom;
    return { x: this.x - hw, y: this.y - hh, width: hw * 2, height: hh * 2 };
  }

  moveTo(x, y) { this.x = this.tx = x; this.y = this.ty = y; }

  /**
   * Zoom about a screen point, so whatever is under the pointer stays there.
   *
   * Scale first, then move the camera by however far that point drifted. This
   * is the whole of it, and it is the difference between zooming and lurching.
   */
  zoomAt(factor, sx, sy) {
    const before = this.unproject(sx, sy);
    this.tzoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.tzoom * factor));
    this.zoom = this.tzoom;
    const after = this.unproject(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.tx = this.x; this.ty = this.y;
  }

  /** Ease toward the target. Frame-rate independent, so a slow frame does not jump. */
  update(dtMs) {
    const t = 1 - Math.pow(0.0015, dtMs / 1000);
    this.x += (this.tx - this.x) * t;
    this.y += (this.ty - this.y) * t;
    if (Math.abs(this.tx - this.x) < 0.01) this.x = this.tx;
    if (Math.abs(this.ty - this.y) < 0.01) this.y = this.ty;
  }

  attach(canvas) {
    let down = false, lastX = 0, lastY = 0, moved = 0;

    canvas.addEventListener('pointerdown', (e) => {
      down = true; moved = 0;
      lastX = e.clientX; lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      // Drag moves the target on the grid plane. Straight translation: a drag
      // of n screen pixels is n / zoom world units, in both axes, always.
      this.tx -= dx / this.zoom;
      this.ty -= dy / this.zoom;
      moved += Math.abs(dx) + Math.abs(dy);
      lastX = e.clientX; lastY = e.clientY;
    });
    const release = () => { down = false; };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', release);

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      this.zoomAt(Math.pow(1.0018, -e.deltaY), e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    this.wasDragged = () => moved > 6;
  }
}
