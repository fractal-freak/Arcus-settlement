/**
 * The feed from the machine.
 *
 * One endpoint, the same one the old canvas world used: the real sky, the town
 * as it has been earned, and every open Claude Code session with what it is
 * doing and what it has built. Nothing here invents anything; it only asks.
 *
 * An at= in the page's own query is passed straight through, so any hour of the
 * day can be looked at without waiting for it.
 *
 * TWO PLACES, ONE PAGE. The same build runs on Kevin's own machine, where the
 * hub answers /world/data with the live settlement AND his open sessions, and
 * on the public site, where there is no hub and a scheduled job has written the
 * settlement to a static file. So it asks the hub first and falls back.
 *
 * The people are the part that cannot travel: a figure is a Claude Code
 * session, and which ones exist is only knowable on the machine they are
 * running on. The public site is the settlement without its crew, and that is
 * correct rather than a gap to be filled — inventing sessions to stand in for
 * real ones would be the one lie this whole project has refused from the
 * start.
 */

import { realmPlacements } from '../app/realm.js';
import { settledPlacements } from '../app/village.js';

function applyPlan(data) {
  if (data.life?.placements) data.life.placements = realmPlacements(settledPlacements(data.life.placements));
  const population=data.life?.population ?? data.population;
  if(data.town && population?.source === 'subscribers' && Number.isSafeInteger(population.count) && population.count >= 0) {
    data.town.folk=population.count;
    data.population=population;
  }
  return data;
}

const LIVE = '/world/data';
const PUBLISHED = 'state/settlement.json';
const CACHE_KEY = 'arcus-settlement:opening-world:v1';

export class Feed {
  constructor(onData) {
    this.onData = onData;
    this.data = null;
    this.failures = 0;
    this.timer = null;
    this.source = null;
    this._liveReceived = false;
  }

  get query() {
    const at = (location.search.match(/[?&]at=([^&]+)/) || [])[1];
    return at ? `?at=${at}` : '';
  }

  async once() {
    if (this._inFlight) return;
    this._inFlight = true;
    try {
      if (this.hosted !== true) {
        try {
          const res = await fetch(LIVE + this.query, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
          if (!res.ok) throw new Error(res.status);
          const d = applyPlan(await res.json());
          this.hosted = false;
          this._liveReceived = true;
          this.accept(d, 'live');
          return;
        } catch {
          // Only decide there is no hub once, on the first try — a single
          // dropped poll on Kevin's own machine must not switch the page over
          // to the published snapshot for the rest of the session.
          if (this.hosted === undefined) this.hosted = true;
          else { this.failures++; return; }
        }
      }

      try {
        const res = await fetch(PUBLISHED, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(res.status);
        const d = applyPlan(await res.json());
        this.accept(d, 'published');
      } catch {
        // A missed poll is not worth showing anyone. Two minutes of them is.
        this.failures++;
      }
    } finally { this._inFlight = false; }
  }

  accept(data, source) {
    this.source = source;
    this.data = data;
    this.failures = 0;
    this.onData(data);
    if (source === 'cache') return;
    // Only the settlement is cached; session titles and commit subjects never
    // enter persistent browser storage or the bundled public snapshot.
    try {
      const cached = { ...data, people: [], town: { ...data.town,
        buildings: data.town?.buildings?.map(({n,trade,weight})=>({n,trade,weight})) ?? [] } };
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: cached }));
    } catch { /* Storage may be unavailable; the bundled snapshot still works. */ }
  }

  async seed() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (cached?.data && Date.now() - cached.at < 24*60*60*1000) {
        this.accept(applyPlan(cached.data), 'cache');
        return;
      }
    } catch { /* No usable local snapshot. */ }
    try {
      const res = await fetch(PUBLISHED, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return;
      const data = applyPlan(await res.json());
      // A slower snapshot must never replace fresher live data.
      if (!this._liveReceived && !this.data) this.accept(data, 'published');
    } catch { /* The live request runs independently. */ }
  }

  beginLive() {
    if (!this._warming) return;
    this._warming = false;
    clearTimeout(this.warmupTimer);
    this.once();
  }

  start(everyMs = 4000) {
    this._warming = true;
    // The local live endpoint can monopolize its server while collecting data.
    // Let static models/textures finish before asking that same server for it.
    this.seed().finally(() => { if (!this.data) this.beginLive(); });
    this.warmupTimer = setTimeout(() => this.beginLive(), 8000);
    this.timer = setInterval(() => {
      if (!document.hidden && !this._warming) this.once();
    }, everyMs);
  }

  stop() { clearInterval(this.timer); clearTimeout(this.warmupTimer); }
}
