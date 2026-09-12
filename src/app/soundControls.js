import { SOUND_LAYERS } from './ambience.js';

const CONDITIONS = {
  wind: 'Stronger in open ground', river: 'Near water', leaves: 'Near greenery',
  birds: 'During daylight', crickets: 'After dark', drone: 'Always present when raised',
  work: 'When nearby citizens strike stone',
  bowls: 'Around the Settlement Stone',
};

/** The mixer changes user gains; the world continues to shape each layer. */
export function mountSoundControls(ambience) {
  const toggle = document.getElementById('sound');
  const panel = document.getElementById('sound-panel');
  const open = document.getElementById('sound-settings');
  const rows = document.getElementById('sound-layers');
  const controls = new Map();
  let armed;
  const disarm = () => {
    if (armed) removeEventListener('pointerdown', armed);
    armed = null;
  };
  const showSound = () => {
    toggle.setAttribute('aria-pressed', String(ambience.on));
    document.getElementById('sound-state').textContent = ambience.on ? 'Sound is on' : 'Sound is off — turn it on to listen.';
    try { localStorage.setItem('sound', ambience.on ? '1' : '0'); } catch { /* private window */ }
  };
  toggle.addEventListener('click', () => { disarm(); ambience.toggle(); showSound(); });

  for (const [key, label] of [['master', 'Master volume'], ...SOUND_LAYERS]) {
    const row = document.createElement('div');
    row.className = 'sound-row';
    const name = document.createElement('label');
    name.htmlFor = `volume-${key}`;
    name.textContent = label;
    if (CONDITIONS[key]) {
      const hint = document.createElement('small');
      hint.className = 'sound-condition';
      hint.textContent = CONDITIONS[key];
      name.append(hint);
    }
    const output = document.createElement('output');
    output.htmlFor = name.htmlFor;
    const slider = document.createElement('input');
    slider.id = name.htmlFor;
    slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '1';
    slider.addEventListener('input', () => ambience.setLevel(key, Number(slider.value) / 100));
    row.append(name, output, slider);
    let mute;
    if (key !== 'master') {
      mute = document.createElement('button');
      mute.type = 'button';
      mute.setAttribute('aria-label', `Mute ${label.toLowerCase()}`);
      mute.addEventListener('click', () => ambience.toggleLayer(key));
      row.append(mute);
    }
    rows.append(row);
    controls.set(key, { row, slider, output, mute });
  }
  const render = () => {
    for (const [key, c] of controls) {
      const v = key === 'master' ? { level: ambience.level, muted: false } : ambience.mix[key];
      c.slider.value = String(Math.round(v.level * 100));
      c.output.value = `${c.slider.value}%`;
      c.row.classList.toggle('muted', v.muted);
      if (c.mute) {
        c.mute.textContent = v.muted ? 'Muted' : 'Mute';
        c.mute.setAttribute('aria-pressed', String(v.muted));
      }
    }
    const status = document.getElementById('sound-loading');
    status.textContent = ambience.failed.size ? `Couldn’t load: ${[...ambience.failed].join(', ')}.`
      : ambience.loading.size ? 'Loading nature recordings…' : 'Your mix is saved on this device.';
    document.getElementById('sound-retry').hidden = !ambience.failed.size;
  };
  ambience.onChange = render;
  render();
  const setOpen = (value) => {
    panel.hidden = !value;
    open.setAttribute('aria-expanded', String(value));
    if (value) document.getElementById('sound-close').focus();
  };
  open.addEventListener('click', () => setOpen(panel.hidden));
  document.getElementById('sound-close').addEventListener('click', () => { setOpen(false); open.focus(); });
  document.getElementById('sound-reset').addEventListener('click', () => ambience.resetMix());
  document.getElementById('sound-retry').addEventListener('click', () => ambience.retryRecordings());
  panel.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { setOpen(false); open.focus(); }
  });
  document.addEventListener('pointerdown', e => {
    if (!panel.hidden && !panel.contains(e.target) && !open.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
  });
  try {
    if (localStorage.getItem('sound') === '1') {
      armed = e => {
        // Let an explicit mute click win over the remembered preference.
        if (toggle.contains(e.target)) return;
        disarm(); ambience.resume(); showSound();
      };
      addEventListener('pointerdown', armed);
    }
  } catch { /* private window */ }
}
