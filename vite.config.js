import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

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
  plugins: [{
    name: 'settlement-startup-snapshot',
    generateBundle() {
      // The public snapshot is sufficient to draw immediately while the local
      // session feed is still working. Never ship sessions or commit subjects.
      const data = JSON.parse(readFileSync(new URL('./state/settlement.json', import.meta.url), 'utf8'));
      data.people = [];
      if (data.town?.buildings) data.town.buildings = data.town.buildings.map(({ n, trade, weight }) => ({ n, trade, weight }));
      this.emitFile({ type: 'asset', fileName: 'state/settlement.json', source: JSON.stringify(data) });
    },
  }],
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});
