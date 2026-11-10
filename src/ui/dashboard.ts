import { Sim } from '../sim/engine';
import { K, DrugId, CHECKLIST_N, onCpb } from '../sim/model';
import { t, hints } from '../i18n';
import { h, fmtTime, fitCanvas } from './dom';
import { WaveMonitor } from './waves';
import { buildField } from './field';
import { buildCircuit } from './circuit';

interface StepperOpts {
  label: string; unit: string; min: number; max: number; step: number; big?: number;
  get: () => number; set: (v: number) => void; fmt?: (v: number) => string;
}

export class Dashboard {
  el: HTMLElement;
  private binds: (() => void)[] = [];
  private waves!: WaveMonitor;
  private field!: ReturnType<typeof buildField>;
  private circuit!: ReturnType<typeof buildCircuit>;
  private dyn!: { guide: HTMLElement; log: HTMLElement; calls: HTMLElement; phase: HTMLElement };
  private alarmBar!: HTMLElement;
  private trend!: HTMLCanvasElement;
  private modal: HTMLElement | null = null;
  private lastRev = -1;
  private lastLogN = 0;
  private lastAlarmKey = '?';
  private slowAcc = 0;

  constructor(private sim: Sim, private onEnd: () => void, private onLang: () => void) {
    this.el = h('div', { class: 'dash' },
      this.topBar(),
      (this.alarmBar = h('div', { class: 'alarm-bar', role: 'status', 'aria-live': 'polite' })),
      h('main', { class: 'grid' }, this.leftCol(), this.centerCol(), this.rightCol()),
    );
  }

  // ------------------------------------------------------------ helpers
  private bind(fn: () => void) { this.binds.push(fn); }
  private val(get: () => string, cls = '') {
    const e = h('span', { class: 'v ' + cls });
    let last = '';
    this.bind(() => { const s = get(); if (s !== last) { e.textContent = s; last = s; } });
    return e;
  }
  private tile(label: string, get: () => string, unit = '', cls = '') {
    return h('div', { class: 'tile ' + cls }, h('div', { class: 'tl' }, label), this.val(get), unit ? h('span', { class: 'u' }, unit) : null);
  }
  private card(title: string, ...children: (Node | null)[]) {
    return h('section', { class: 'card' }, h('h2', null, title), ...children);
  }
  private stepper(o: StepperOpts) {
    const dec = (String(o.step).split('.')[1] || '').length;
    const fmt = o.fmt ?? ((v: number) => v.toFixed(dec));
    const apply = (v: number) => {
      v = Math.round(v / o.step) * o.step;
      o.set(Math.min(o.max, Math.max(o.min, +v.toFixed(4))));
    };
    const input = h('input', { type: 'range', min: o.min, max: o.max, step: o.step, 'aria-label': o.label });
    input.addEventListener('input', () => apply(+input.value));
    const btn = (txt: string, d: number) => {
      const b = h('button', { type: 'button', class: 'st-btn', 'aria-label': `${o.label} ${txt}` }, txt);
      let timer: number | undefined, rep: number | undefined;
      const stop = () => { clearTimeout(timer); clearInterval(rep); };
      b.addEventListener('pointerdown', () => {
        apply(o.get() + d);
        timer = window.setTimeout(() => { rep = window.setInterval(() => apply(o.get() + d), 90); }, 350);
      });
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apply(o.get() + d); } });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
      return b;
    };
    const value = h('span', { class: 'st-val' });
    this.bind(() => { const v = o.get(); input.value = String(v); value.textContent = fmt(v); });
    return h('div', { class: 'stepper' },
      h('div', { class: 'st-head' }, h('span', { class: 'st-label' }, o.label), h('span', null, value, h('span', { class: 'u' }, ' ' + o.unit))),
      h('div', { class: 'st-row' },
        o.big ? btn('−−', -o.big) : null, btn('−', -o.step), input, btn('+', o.step), o.big ? btn('++', o.big) : null),
    );
  }
  private toggle(label: () => string, isOn: () => boolean, onClick: () => void, enabled: () => boolean = () => true) {
    const b = h('button', { type: 'button', class: 'toggle' });
    b.addEventListener('click', () => { if (enabled()) onClick(); });
    this.bind(() => { b.textContent = label(); b.classList.toggle('on', isOn()); b.disabled = !enabled(); b.setAttribute('aria-pressed', String(isOn())); });
    return b;
  }

  // ------------------------------------------------------------ top bar
  private topBar() {
    const sim = this.sim, s = sim.s;
    const speeds = [1, 2, 5, 10, 30];
    const speedBtns = speeds.map((sp) => {
      const b = h('button', { type: 'button', class: 'sp-btn' }, '×' + sp);
      b.addEventListener('click', () => { sim.speed = sp; sim.paused = false; });
      this.bind(() => { b.classList.toggle('on', sim.speed === sp && !sim.paused); });
      return b;
    });
    const pause = h('button', { type: 'button', class: 'sp-btn pause' });
    pause.addEventListener('click', () => { if (!sim.criticalPending) sim.paused = !sim.paused; });
    this.bind(() => { pause.textContent = sim.paused ? '▶ ' + t('u.resume') : '❚❚ ' + t('u.pause'); pause.classList.toggle('on', sim.paused); });
    const auto = h('input', { type: 'checkbox', id: 'autoslow' });
    auto.checked = sim.autoSlow;
    auto.addEventListener('change', () => { sim.autoSlow = auto.checked; });
    const cpbT = () => (s.tm.cpbStart === null ? null : (s.tm.cpbEnd ?? s.t) - s.tm.cpbStart);
    const clT = () => (s.tm.clampStart === null ? null : (s.tm.clampEnd ?? s.t) - s.tm.clampStart);
    return h('header', { class: 'top' },
      h('div', { class: 'brand' }, h('strong', null, t('u.title')), h('span', null, t('u.sc.cabg'))),
      h('div', { class: 'timers' },
        this.tile(t('u.elapsed'), () => fmtTime(s.t)),
        this.tile(t('u.cpb_time'), () => fmtTime(cpbT()), '', 'cpb'),
        this.tile(t('u.clamp_time'), () => fmtTime(clT()), '', 'xc'),
      ),
      h('div', { class: 'speed' },
        h('span', { class: 'tl' }, t('u.speed')), ...speedBtns, pause,
        h('label', { class: 'chk', for: 'autoslow' }, auto, t('u.autoslow')),
      ),
      h('div', { class: 'top-right' },
        h('button', { type: 'button', class: 'ghost', onclick: () => this.onLang() }, t('u.lang')),
        h('button', { type: 'button', class: 'ghost', onclick: () => this.onEnd() }, t('u.finish_now')),
      ),
    );
  }

  // ------------------------------------------------------------ left column: monitors
  private leftCol() {
    const s = this.sim.s, p = s.pt;
    const canvas = h('canvas', { class: 'wave' });
    this.waves = new WaveMonitor(canvas);
    const pulsatile = () => p.hr > 0 && p.sys - p.dia > 8;
    const n0 = (x: number) => String(Math.round(x));
    const vitals = this.card(t('u.vitals'),
      h('div', { class: 'mon' },
        canvas,
        h('div', { class: 'mon-nums' },
          h('div', { class: 'num ecg' }, h('div', { class: 'tl' }, 'HR'), this.val(() => (p.hr > 0 ? n0(p.hr) : p.rhythm === 'vf' ? 'VF' : '0')),
            this.val(() => t('u.rhythm.' + p.rhythm), 'sub')),
          h('div', { class: 'num art' }, h('div', { class: 'tl' }, 'ABP mmHg'),
            this.val(() => (pulsatile() ? `${n0(p.sys)}/${n0(p.dia)}` : `(${n0(p.map)})`)),
            this.val(() => (pulsatile() ? `(${n0(p.map)})` : 'MAP'), 'sub')),
          h('div', { class: 'num cvp' }, h('div', { class: 'tl' }, 'CVP mmHg'), this.val(() => n0(p.cvp))),
          h('div', { class: 'num spo2' }, h('div', { class: 'tl' }, 'SpO₂ %'), this.val(() => (pulsatile() ? n0(Math.min(100, p.sao2 * 100)) : '---'))),
        ),
      ),
      h('div', { class: 'tiles' },
        this.tile(t('u.np'), () => p.tNP.toFixed(1), '°C', 'temp'),
        this.tile(t('u.bladder'), () => p.tBl.toFixed(1), '°C', 'temp'),
        this.tile(t('u.ventilation'), () => (p.ventilated ? t('u.on') : t('u.off'))),
        this.tile(t('u.urine'), () => n0(p.urine), 'mL'),
      ),
    );

    this.trend = h('canvas', { class: 'trend' });
    const pct = (v: number) => { const d = Math.round((v / p.rso2Base - 1) * 100); return (d > 0 ? '+' : '') + d + '%'; };
    const L = () => p.rso2 + 1, R = () => p.rso2 - 1.5;
    const invos = this.card(t('u.invos'),
      h('div', { class: 'invos' },
        h('div', { class: 'num rso' }, h('div', { class: 'tl' }, 'L'), this.val(() => n0(L())), this.val(() => pct(L() - 1), 'sub')),
        h('div', { class: 'num rso' }, h('div', { class: 'tl' }, 'R'), this.val(() => n0(R())), this.val(() => pct(R() + 1.5), 'sub')),
        this.trend,
      ),
    );

    this.field = buildField();
    const fieldCard = this.card(t('u.field'),
      this.field.el,
      h('div', { class: 'field-cap' }, this.val(() => t(s.surg.step))),
      h('div', { class: 'tiles' },
        this.tile(t('u.field_pool'), () => n0(s.surg.pool), 'mL'),
        this.tile(t('u.lv'), () => n0(p.lvDist * 100), '%'),
      ),
    );
    return h('div', { class: 'col left' }, vitals, invos, fieldCard);
  }

  // ------------------------------------------------------------ centre column: heart-lung machine
  private centerCol() {
    const sim = this.sim, s = sim.s, hl = s.hlm, cp = s.cp, p = s.pt;
    const roller = s.cfg.pumpType === 'roller';
    this.circuit = buildCircuit(s, () => {});
    const circuitCard = this.card(t('u.circuit'), this.circuit.el);

    const pump = this.card(`${t('u.art_pump')}（${roller ? t('u.roller') : t('u.centrifugal')}）`,
      h('div', { class: 'tiles' },
        this.tile(t('u.flow'), () => hl.flow.toFixed(2), 'L/min', 'big'),
        this.tile('PI', () => (hl.flow / s.bsa).toFixed(2), 'L/min/m²'),
        this.tile(t('u.target'), () => s.targetFlow.toFixed(2), 'L/min'),
        this.tile(t('u.line_p'), () => String(Math.round(hl.lineP)), 'mmHg'),
      ),
      this.stepper({
        label: t('u.rpm'), unit: 'rpm', min: 0, max: roller ? K.ROLLER_MAX : K.CENT_MAX, step: roller ? 1 : 10, big: roller ? 10 : 100,
        get: () => hl.rpm, set: (v) => { hl.rpm = v; }, fmt: (v) => String(Math.round(v)),
      }),
      h('div', { class: 'row' },
        this.toggle(() => `${t('u.art_clamp')}: ${hl.artOpen ? t('u.open') : t('u.closed')}`, () => hl.artOpen,
          () => { hl.artOpen = !hl.artOpen; }, () => s.surg.artCannula),
      ),
    );

    const ven = this.card(t('u.ven'),
      h('div', { class: 'tiles' },
        this.tile(t('u.ven_flow'), () => hl.venFlow.toFixed(2), 'L/min'),
        this.tile(t('u.reservoir'), () => String(Math.round(hl.resVol)), 'mL', 'big'),
      ),
      this.stepper({
        label: t('u.ven_occ'), unit: '%', min: 0, max: 100, step: 5,
        get: () => Math.round(hl.venOcc * 100), set: (v) => { if (s.surg.venCannula) hl.venOcc = v / 100; },
      }),
    );

    const gas = this.card(t('u.gas'),
      this.stepper({ label: t('u.fio2'), unit: '', min: 0.21, max: 1, step: 0.01, big: 0.1, get: () => hl.fio2, set: (v) => { hl.fio2 = v; } }),
      this.stepper({ label: t('u.sweep'), unit: 'L/min', min: 0, max: 8, step: 0.1, big: 0.5, get: () => hl.sweep, set: (v) => { hl.sweep = v; } }),
    );

    const hc = this.card(t('u.hc'),
      h('div', { class: 'tiles' },
        this.tile(t('u.water'), () => hl.water.toFixed(1), '°C'),
        this.tile(t('u.t_art'), () => hl.tArt.toFixed(1), '°C', 'temp'),
        this.tile(t('u.t_ven'), () => hl.tVen.toFixed(1), '°C', 'temp'),
      ),
      this.stepper({ label: t('u.water_set'), unit: '°C', min: 15, max: 41, step: 0.5, big: 2, get: () => hl.waterSet, set: (v) => { hl.waterSet = v; } }),
      h('div', { class: 'row' }, this.toggle(() => `${t('u.hc_on')}: ${hl.hcOn ? t('u.on') : t('u.off')}`, () => hl.hcOn, () => { hl.hcOn = !hl.hcOn; })),
    );

    const sv = this.card(t('u.suction_vent'),
      this.stepper({ label: t('u.suction'), unit: 'mL/min', min: 0, max: 600, step: 10, big: 50, get: () => hl.suction, set: (v) => { hl.suction = v; } }),
      this.stepper({ label: t('u.vent'), unit: 'mL/min', min: 0, max: 400, step: 10, big: 50, get: () => hl.vent, set: (v) => { hl.vent = v; } }),
    );

    const since = () => (s.surg.xclamp && cp.doses > 0 ? fmtTime(s.t - cp.lastFlowT) : '--:--');
    const cpCard = this.card(`${t('u.cp')}（${s.cfg.cpType === 'blood' ? t('u.cp_blood') : t('u.cp_cryst')}）`,
      h('div', { class: 'tiles' },
        this.tile(t('u.cp_dose'), () => `${Math.round(cp.doseVol)} / ${cp.target}`, 'mL', 'big wide'),
        this.tile(t('u.cp_total'), () => String(Math.round(cp.total)), 'mL'),
        this.tile(t('u.cp_p'), () => String(Math.round(cp.pressure)), 'mmHg'),
        this.tile('', () => String(Math.round(cp.rootP)), 'mmHg', 'rootp'),
        this.tile(t('u.cp_since'), since, '', 'since'),
      ),
      this.stepper({ label: t('u.cp_flow'), unit: 'mL/min', min: 0, max: 400, step: 10, big: 50, get: () => cp.flow, set: (v) => { cp.flow = v; } }),
      h('div', { class: 'row' },
        s.cfg.cpRetro
          ? this.toggle(() => `${t('u.cp_route')}: ${cp.route === 'ante' ? t('u.ante') : t('u.retro')}`, () => cp.route === 'retro',
            () => { if (cp.flow === 0) cp.route = cp.route === 'ante' ? 'retro' : 'ante'; }, () => cp.flow === 0)
          : h('span', { class: 'note' }, `${t('u.cp_route')}: ${t('u.ante')}`),
        h('button', { type: 'button', class: 'toggle stop', onclick: () => { cp.flow = 0; } }, '■ ' + t('u.stop')),
      ),
    );
    const rootLabel = cpCard.querySelector('.rootp .tl')!;
    this.bind(() => { rootLabel.textContent = cp.route === 'ante' ? t('u.cp_rootp_ante') : t('u.cp_rootp_retro'); });

    const inline = this.card(t('u.inline'),
      h('div', { class: 'tiles' },
        this.tile('SvO₂', () => (hl.venFlow > 0.3 ? String(Math.round(p.svo2 * 100)) : '--'), '%', 'big'),
        this.tile('Hct', () => (onCpb(s) ? (p.hct * 100).toFixed(0) : '--'), '%'),
        this.tile('DO₂i', () => (onCpb(s) ? String(Math.round(p.do2 / s.bsa)) : '--'), 'mL/min/m²'),
      ),
      this.stepper({ label: t('u.hemo'), unit: 'mL/min', min: 0, max: 80, step: 10, get: () => hl.hemo, set: (v) => { hl.hemo = v; } }),
      h('div', { class: 'note' }, this.val(() => `${t('u.removed')}: ${Math.round(hl.hemoTotal)} mL`)),
    );

    return h('div', { class: 'col center' }, circuitCard, h('div', { class: 'cards' }, pump, ven, gas, hc, cpCard, sv, inline));
  }

  // ------------------------------------------------------------ right column: team and tasks
  private rightCol() {
    const sim = this.sim, s = sim.s;
    this.dyn = {
      phase: h('div', { class: 'phase' }),
      guide: h('div', { class: 'guide' }),
      log: h('div', { class: 'log', role: 'log', 'aria-live': 'polite' }),
      calls: h('div', { class: 'calls' }),
    };
    const drug = (id: DrugId) => h('button', { type: 'button', class: 'act-btn', onclick: () => sim.drug(id) }, t('d.' + id));
    const ago = (tt: number) => t('u.min_ago', { m: Math.floor((s.t - tt) / 60) });
    const actTxt = () => {
      const l = s.lab;
      const last = l.lastAct ? `${l.lastAct.value >= 999 ? '>999' : l.lastAct.value} s（${ago(l.lastAct.tSample)}）` : t('u.none');
      return l.actPending ? `${last} ・ ${t('u.pending')}` : last;
    };
    const bgaEl = h('div', { class: 'bga' });
    let bgaKey = '';
    this.bind(() => {
      const b = s.lab.lastBga;
      const key = (b ? b.t : 'n') + (s.lab.bgaPending ? 'p' : '') + Math.floor(s.t / 60);
      if (key === bgaKey) return;
      bgaKey = key;
      bgaEl.textContent = '';
      if (!b) { bgaEl.append(s.lab.bgaPending ? t('u.pending') : t('u.none')); return; }
      const rows: [string, string][] = [
        ['pH', b.ph.toFixed(2)], ['PaCO₂', b.pco2.toFixed(0)], ['PaO₂', b.po2.toFixed(0)], ['HCO₃⁻', b.hco3.toFixed(1)],
        ['BE', b.be.toFixed(1)], ['Hct', b.hct.toFixed(0) + '%'], ['Hb', b.hb.toFixed(1)], ['K⁺', b.k.toFixed(1)],
        ['Lac', b.lac.toFixed(1)], ['SaO₂', b.sao2.toFixed(0) + '%'], ['SvO₂', b.svo2.toFixed(0) + '%'],
      ];
      bgaEl.append(h('div', { class: 'bga-grid' }, ...rows.map(([k, v]) => h('div', null, h('span', { class: 'tl' }, k), h('b', null, v)))),
        h('div', { class: 'note' }, ago(b.t) + (s.lab.bgaPending ? ' ・ ' + t('u.pending') : '')));
    });

    return h('div', { class: 'col right' },
      h('section', { class: 'card' }, h('h2', null, t('u.phase')), this.dyn.phase, this.dyn.guide),
      h('section', { class: 'card' }, h('h2', null, t('u.comm')), this.dyn.log, h('h3', null, t('u.calls')), this.dyn.calls),
      this.card(t('u.actions'),
        h('div', { class: 'act-grid' },
          h('button', { type: 'button', class: 'act-btn lab', onclick: () => sim.act() }, t('u.act_btn')),
          h('button', { type: 'button', class: 'act-btn lab', onclick: () => sim.bga() }, t('u.bga_btn')),
          drug('phenyl'), drug('nicard'), drug('cryst100'), drug('cryst250'), drug('rbc'), drug('bicarb'), drug('heparin'),
        ),
        h('h3', null, t('u.labs')),
        h('div', { class: 'lab-line' }, h('span', { class: 'tl' }, t('u.act')), this.val(actTxt)),
        h('div', { class: 'tl' }, t('u.bga')), bgaEl,
      ),
    );
  }

  private renderDynamic() {
    const sim = this.sim, s = sim.s, d = this.dyn;
    d.phase.textContent = t('s.' + sim.phase);
    // guide / checklist
    d.guide.textContent = '';
    if (sim.phase === 'prep') {
      d.guide.append(h('h3', null, t('u.checklist')),
        h('ul', { class: 'checklist' }, ...Array.from({ length: CHECKLIST_N }, (_, i) => {
          const cb = h('input', { type: 'checkbox', id: 'ck' + i });
          cb.checked = s.checklist[i];
          cb.addEventListener('change', () => { s.checklist[i] = cb.checked; });
          return h('li', null, h('label', { for: 'ck' + i }, cb, t('k.' + i)));
        })));
    }
    if (s.cfg.hints) {
      const hs = hints(sim.phase);
      if (hs.length) d.guide.append(h('h3', null, t('u.guide')), h('ul', { class: 'hints' }, ...hs.map((x) => h('li', null, x))));
    }
    // log
    if (sim.log.length < this.lastLogN) { d.log.textContent = ''; this.lastLogN = 0; }
    for (let i = this.lastLogN; i < sim.log.length; i++) {
      const m = sim.log[i];
      d.log.append(h('div', { class: 'msg ' + m.from },
        h('span', { class: 'mt' }, fmtTime(m.t)), h('span', { class: 'who' }, t('u.who.' + m.from)),
        h('span', { class: 'tx' }, t(m.key, m.params))));
    }
    this.lastLogN = sim.log.length;
    d.log.scrollTop = d.log.scrollHeight;
    // calls
    d.calls.textContent = '';
    for (const id of sim.calls) d.calls.append(h('button', { type: 'button', class: 'call-btn', onclick: () => sim.call(id) }, t('c.' + id)));
    if (!sim.calls.length) d.calls.append(h('span', { class: 'note' }, '—'));
  }

  private renderAlarms() {
    const a = this.sim.activeAlarms;
    const key = a.map((x) => x.id).join(',');
    if (key === this.lastAlarmKey) return;
    this.lastAlarmKey = key;
    this.alarmBar.textContent = '';
    if (!a.length) this.alarmBar.append(h('span', { class: 'chip ok' }, t('u.no_alarm')));
    for (const x of a) this.alarmBar.append(h('span', { class: 'chip ' + x.level }, '⚠ ' + t('a.' + x.id)));
  }

  private renderCritical() {
    const sim = this.sim;
    if (sim.criticalPending && !this.modal) {
      const btn = h('button', { type: 'button', class: 'primary' }, t('u.continue'));
      btn.addEventListener('click', () => { sim.criticalPending = null; sim.paused = false; sim.speed = 1; this.modal?.remove(); this.modal = null; });
      this.modal = h('div', { class: 'overlay', role: 'alertdialog', 'aria-modal': 'true' },
        h('div', { class: 'dialog crit' }, h('h2', null, '⚠ ' + t('u.critical')), h('p', null, t(sim.criticalPending)), btn));
      this.el.append(this.modal);
      btn.focus();
    }
  }

  private drawTrend() {
    const s = this.sim.s;
    const { ctx, w, h: hh } = fitCanvas(this.trend);
    ctx.clearRect(0, 0, w, hh);
    const data = s.hist.slice(-180);
    const Y = (v: number) => hh - 2 - ((Math.min(95, Math.max(30, v)) - 30) / 65) * (hh - 4);
    ctx.strokeStyle = '#3a4756'; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(0, Y(s.pt.rso2Base * 0.8)); ctx.lineTo(w, Y(s.pt.rso2Base * 0.8)); ctx.stroke();
    ctx.setLineDash([]);
    if (data.length < 2) return;
    for (const [off, color] of [[1, '#f4d35e'], [-1.5, '#7ee0ff']] as [number, string][]) {
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath();
      data.forEach((d, i) => { const x = (i / 179) * w; if (i === 0) ctx.moveTo(x, Y(d.rso2 + off)); else ctx.lineTo(x, Y(d.rso2 + off)); });
      ctx.stroke();
    }
  }

  // ------------------------------------------------------------ frame
  frame(dt: number) {
    const sim = this.sim, s = sim.s;
    const running = !sim.paused && !sim.finished;
    this.waves.draw(s, dt, running);
    this.field.update(s, running ? dt : 0, sim.graftCount());
    this.circuit.update(running ? dt * Math.min(sim.speed, 3) : 0);
    this.slowAcc += dt;
    if (this.slowAcc > 0.15) {
      this.slowAcc = 0;
      for (const b of this.binds) b();
      this.renderAlarms();
      this.drawTrend();
    }
    if (sim.rev !== this.lastRev) { this.lastRev = sim.rev; this.renderDynamic(); }
    this.renderCritical();
  }
}
