/** Opt-in live timings: ?profile=1 for whole frames, ?profile=passes for individual GPU passes.
 * Disabled during normal use. Synchronous step() alone does not measure GPU completion. */
export class FramePerformance {
  constructor(renderer) {
    this.renderer = renderer;
    this.frames = [];
    this.mode = new URLSearchParams(location.search).get('profile');
    this.enabled = this.mode !== null;
    this.byPass = new Map();
    this.pending = [];
    this.ext = this.enabled ? renderer.getContext().getExtension('EXT_disjoint_timer_query_webgl2') : null;
    this.startedAt = performance.now();
    this.lastPublish = 0;
  }
  beginGpu(label = 'frame') {
    const gl = this.renderer.getContext();
    if (!this.ext || this.pending.length >= 32) return null;
    const q = gl.createQuery();
    gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    return { q, label };
  }
  endGpu(query) {
    if (!query) return;
    this.renderer.getContext().endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(query);
  }
  record(frame) {
    if (!this.enabled) return;
    this.frames.push(frame);
    if (this.frames.length > 180) this.frames.shift();
    const gl = this.renderer.getContext();
    const disjoint = this.ext && gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    while (this.pending.length && gl.getQueryParameter(this.pending[0].q, gl.QUERY_RESULT_AVAILABLE)) {
      const { q, label } = this.pending.shift();
      if (!disjoint) {
        const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        if (!this.byPass.has(label)) this.byPass.set(label, []);
        const list = this.byPass.get(label); list.push(ms); if (list.length > 90) list.shift();
      }
      gl.deleteQuery(q);
    }
    if (performance.now() - this.lastPublish < 1000) return;
    this.lastPublish = performance.now();
    this.renderer.domElement.dataset.performance = JSON.stringify({ ...this.summary(), ...this.context?.() });
  }
  attach(stage) {
    if (!this.enabled) return;
    const wrap = (object, method, name) => {
      const original = object[method];
      object[method] = (...args) => {
        const q = this.beginGpu(name);
        try { return original.apply(object,args); } finally { this.endGpu(q); }
      };
    };
    if (this.mode === 'passes') {
      wrap(stage, '_renderDepth', 'depth');
      stage.composer.passes.forEach((pass,i)=>wrap(pass,'render',i===0?'scene':'effects'));
    } else wrap(stage,'render','frame');
  }
  summary() {
    const stats = values => {
      if (!values.length) return null;
      const sorted = [...values].sort((a,b) => a-b);
      return { median: +sorted[Math.floor(sorted.length*.5)].toFixed(1),
        p95: +sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))].toFixed(1),
        max: +sorted.at(-1).toFixed(1) };
    };
    return Object.fromEntries(['interval','cpu','terrain','animation','render','environment','overlay'].map(key =>
      [key, stats(this.frames.map(f => f[key]))]).concat([['gpu',Object.fromEntries([...this.byPass].map(([name,times])=>[name,stats(times)]))]]));
  }
}
