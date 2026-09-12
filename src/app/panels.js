/** Shared utility drawer lifecycle. Opening one dismisses its predecessor. */
const entries = new Map();
let active;
export function registerPanel(panel, trigger) {
  entries.set(panel, trigger);
  panel.classList.add('world-panel');
  panel.setAttribute('role', 'region');
  panel.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); setPanel(panel, false); }
  });
}
export function closePanels() {
  for (const [panel, trigger] of entries) {
    panel.hidden = true;
    trigger?.setAttribute('aria-expanded', 'false');
  }
  active = undefined;
  document.body.classList.remove('panel-open');
}
export function setPanel(panel, open, { focus = true } = {}) {
  const trigger = entries.get(panel);
  closePanels();
  if (open) {
    active = panel;
    panel.hidden = false;
    trigger?.setAttribute('aria-expanded', 'true');
    document.body.classList.add('panel-open');
    document.dispatchEvent(new Event('world-panel-open'));
    if (focus) panel.querySelector('button,input,a')?.focus({ preventScroll: true });
  } else if (focus) trigger?.focus({ preventScroll: true });
}
export function panelOpen() { return !!active; }

document.addEventListener('keydown', event => {
  if (active && event.key === 'Escape') {
    event.preventDefault();event.stopImmediatePropagation();setPanel(active,false);
  }
},true);
