import './style.css';
import { Sim } from './sim/engine';
import { Config, defaultConfig } from './sim/model';
import { getLang, setLang } from './i18n';
import { buildSetup } from './ui/setup';
import { Dashboard } from './ui/dashboard';
import { buildDebrief } from './ui/debrief';

const root = document.getElementById('app')!;
let cfg: Config = { ...defaultConfig };
let sim: Sim | null = null;
let dash: Dashboard | null = null;
let debriefShown = false;

try {
  const saved = localStorage.getItem('cpb-lang');
  if (saved === 'ja' || saved === 'en') setLang(saved);
  else if (!navigator.language.toLowerCase().startsWith('ja')) setLang('en');
} catch { /* storage unavailable */ }

function toggleLang() {
  setLang(getLang() === 'ja' ? 'en' : 'ja');
  try { localStorage.setItem('cpb-lang', getLang()); } catch { /* ignore */ }
  document.documentElement.lang = getLang();
  render();
}

function showDebrief() {
  if (!sim || debriefShown) return;
  debriefShown = true;
  sim.paused = true;
  root.append(buildDebrief(sim, () => { sim = null; dash = null; debriefShown = false; render(); }));
}

function render() {
  root.textContent = '';
  document.documentElement.lang = getLang();
  if (!sim) {
    root.append(buildSetup(cfg, (c) => { cfg = c; sim = new Sim(c); debriefShown = false; render(); }, toggleLang));
    return;
  }
  dash = new Dashboard(sim, showDebrief, toggleLang);
  root.append(dash.el);
  if (debriefShown) { debriefShown = false; showDebrief(); }
}

let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (sim && dash) {
    sim.advance(dt * sim.speed);
    dash.frame(dt);
    if (sim.finished && !debriefShown) showDebrief();
  }
  requestAnimationFrame(loop);
}

render();
requestAnimationFrame(loop);

// Expose for debugging and automated checks.
(window as any).__cpb = { get sim() { return sim; } };
