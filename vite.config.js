import { defineConfig } from 'vite';

/**
 * Base is relative, not the hub's absolute path or GitHub Pages' absolute
 * path. Either one hardcoded would break the other: asset URLs baked in as
 * `/world/next/assets/...` 404 under `/arcus-settlement/`, and the reverse
 * breaks local preview through the hub immediately, every build, until
 * someone remembers to flip it back.
 *
 * `base: './'` sidesteps that — every asset URL in the built HTML is relative
 * to wherever the page's own URL is, so the SAME `dist/` serves correctly
 * whether that is http://localhost:5199/world/next/ (the hub, and the only
 * place this has ever actually been served from) or
 * https://<user>.github.io/arcus-settlement/ (not deployed anywhere yet — no
 * repo, no remote, no Pages config exists for this project. That is a
 * separate, outward-facing step for whenever it is actually wanted).
 */
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});
