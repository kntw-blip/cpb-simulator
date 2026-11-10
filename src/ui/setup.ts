import { Config, defaultConfig, bsaOf } from '../sim/model';
import { t } from '../i18n';
import { h } from './dom';

export function buildSetup(initial: Config, onStart: (cfg: Config) => void, onLang: () => void): HTMLElement {
  const cfg: Config = { ...initial };

  const radio = <T extends string | number | boolean>(name: string, opts: [T, string, boolean?][], get: () => T, set: (v: T) => void) =>
    h('div', { class: 'opts', role: 'radiogroup' }, ...opts.map(([v, label, disabled], i) => {
      const id = `${name}-${i}`;
      const inp = h('input', { type: 'radio', name, id, disabled: !!disabled });
      inp.checked = get() === v;
      inp.addEventListener('change', () => { if (inp.checked) set(v); });
      return h('label', { for: id, class: 'opt' + (disabled ? ' disabled' : '') }, inp, h('span', null, label));
    }));

  const patientNote = h('div', { class: 'note' });
  const upd = () => {
    patientNote.textContent = t('u.patient_desc', {
      w: cfg.weight, h: cfg.height, bsa: bsaOf(cfg.weight, cfg.height).toFixed(2), hct: Math.round(cfg.hct0 * 100),
    }) + ` ・ ${t('u.target')} ${(2.4 * bsaOf(cfg.weight, cfg.height)).toFixed(2)} L/min`;
  };
  const num = (label: string, min: number, max: number, get: () => number, set: (v: number) => void) => {
    const id = 'n-' + label;
    const inp = h('input', { type: 'number', id, min, max, value: get(), inputmode: 'numeric' });
    inp.addEventListener('change', () => {
      const v = Math.min(max, Math.max(min, Math.round(+inp.value || get())));
      inp.value = String(v); set(v); upd();
    });
    return h('label', { for: id, class: 'numf' }, h('span', null, label), inp);
  };
  upd();

  const hintCb = h('input', { type: 'checkbox', id: 'hints' });
  hintCb.checked = cfg.hints;
  hintCb.addEventListener('change', () => { cfg.hints = hintCb.checked; });

  const soon = (k: string) => `${t(k)}（${t('u.soon')}）`;
  return h('div', { class: 'setup' },
    h('header', { class: 'setup-head' },
      h('div', null, h('h1', null, t('u.title')), h('p', null, t('u.subtitle'))),
      h('button', { type: 'button', class: 'ghost', onclick: onLang }, t('u.lang')),
    ),
    h('p', { class: 'disclaimer' }, t('u.disclaimer')),
    h('section', { class: 'card' }, h('h2', null, t('u.scenario')),
      radio('sc', [['cabg', t('u.sc.cabg')], ['avr', soon('u.sc.avr'), true], ['mvr', soon('u.sc.mvr'), true], ['aorta', soon('u.sc.aorta'), true]],
        () => 'cabg', () => {}),
      h('div', { class: 'note' }, t('u.sim_time_note'))),
    h('section', { class: 'card' }, h('h2', null, t('u.pump_type')),
      radio('pump', [['roller', t('u.roller')], ['centrifugal', t('u.centrifugal')]], () => cfg.pumpType, (v) => { cfg.pumpType = v; })),
    h('section', { class: 'card' }, h('h2', null, t('u.cp_type')),
      radio('cpt', [['blood', t('u.cp_blood')], ['crystalloid', t('u.cp_cryst')]], () => cfg.cpType, (v) => { cfg.cpType = v; }),
      h('h3', null, t('u.cp_route')),
      radio('cpr', [[false, t('u.cp_ante_only')], [true, t('u.cp_ante_retro')]], () => cfg.cpRetro, (v) => { cfg.cpRetro = v; })),
    h('section', { class: 'card' }, h('h2', null, t('u.temp_mgmt')),
      radio('tmp', [[34, t('u.temp34')], [36, t('u.temp36')]], () => cfg.targetTemp, (v) => { cfg.targetTemp = v; })),
    h('section', { class: 'card' }, h('h2', null, t('u.patient')),
      h('div', { class: 'numrow' },
        num(t('u.weight'), 40, 120, () => cfg.weight, (v) => { cfg.weight = v; }),
        num(t('u.height'), 140, 200, () => cfg.height, (v) => { cfg.height = v; }),
        num(t('u.hct0'), 30, 48, () => Math.round(cfg.hct0 * 100), (v) => { cfg.hct0 = v / 100; })),
      patientNote),
    h('label', { class: 'chk big', for: 'hints' }, hintCb, t('u.hints')),
    h('button', {
      type: 'button', class: 'primary start',
      onclick: () => onStart({ ...cfg, seed: Math.floor(Math.random() * 1e9) }),
    }, t('u.start')),
  );
}

export { defaultConfig };
