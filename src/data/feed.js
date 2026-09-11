/**
 * The feed from the machine.
 *
 * One endpoint, the same one the old canvas world used: the real sky, the town
 * as it has been earned, and every open Claude Code session with what it is
 * doing and what it has built. Nothing here invents anything; it only asks.
 *
 * An at= in the page's own query is passed straight through, so any hour of the
 * day can be looked at without waiting for it.
 */

const ENDPOINT = '/world/data';

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
    try {
      const res = await fetch(ENDPOINT + this.query, { cache: 'no-store' });
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
