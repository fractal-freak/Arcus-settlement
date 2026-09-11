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

const LIVE = '/world/data';
const PUBLISHED = 'state/settlement.json';

export class Feed {
  constructor(onData) {
    this.onData = onData;
    this.data = null;
    this.failures = 0;
    this.timer = null;
  }

  get query() {
    const at = (location.search.match(/[?&]at=([^&]+)/) || [])[1];
    return at ? `?at=${at}` : '';
  }

  async once() {
    if (this.hosted !== true) {
      try {
        const res = await fetch(LIVE + this.query, { cache: 'no-store' });
        if (!res.ok) throw new Error(res.status);
        const d = await res.json();
        this.hosted = false;
        this.data = d;
        this.failures = 0;
        this.onData(d);
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
      const res = await fetch(PUBLISHED, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const d = await res.json();
      this.data = d;
      this.failures = 0;
      this.onData(d);
    } catch {
      // A missed poll is not worth showing anyone. Two minutes of them is.
      this.failures++;
    }
  }

  start(everyMs = 4000) {
    this.once();
    this.timer = setInterval(() => {
      if (!document.hidden) this.once();
    }, everyMs);
  }

  stop() { clearInterval(this.timer); }
}
