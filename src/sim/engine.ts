import {
  State, Config, createState, step, alarms, Alarm, onCpb, requestAct, requestBga, giveDrug, DrugId, K,
} from './model';
import { cabg } from './scenarios/cabg';

export type Speaker = 'surgeon' | 'anes' | 'perf' | 'system';
export interface Msg { t: number; from: Speaker; key: string; params?: Record<string, string | number> }
export interface Penalty { t: number; id: string; pts: number; key: string; critical?: boolean }

export type Wait =
  | { kind: 'time'; until: number }
  | { kind: 'until'; fn: () => boolean; deadline: number }
  | { kind: 'call'; ids: string[] };

export type Script = Generator<Wait, void, any>;

export class Sim {
  s: State;
  speed = 1;
  paused = false;
  autoSlow = true;
  phase = 'prep';
  calls: string[] = [];
  log: Msg[] = [];
  penalties: Penalty[] = [];
  finished = false;
  /** Critical incident waiting to be acknowledged by the UI (i18n key). */
  criticalPending: string | null = null;
  activeAlarms: Alarm[] = [];
  /** Incremented whenever log / calls / phase change so the UI can re-render those parts. */
  rev = 0;

  private gen: Script;
  private wait: Wait | null = null;
  private acc = 0;
  private sampleAcc = 0;
  private held = new Map<string, number>();
  private cool = new Map<string, number>();
  private lastActOnCpb = 0;

  constructor(cfg: Config) {
    this.s = createState(cfg);
    this.gen = cabg(this);
    this.resume(undefined);
  }

  // ---------- scenario API ----------
  say(from: Speaker, key: string, params?: Record<string, string | number>, attention = false) {
    this.log.push({ t: this.s.t, from, key, params });
    if (attention && this.autoSlow && this.speed > 1) this.speed = 1;
    this.rev++;
  }
  penalty(id: string, pts: number, critical = false) {
    this.penalties.push({ t: this.s.t, id, pts, key: 'p.' + id, critical });
    this.rev++;
  }
  critical(id: string, pts: number) {
    this.penalty(id, pts, true);
    this.criticalPending = 'p.' + id;
    this.paused = true;
  }
  setPhase(id: string) { this.phase = id; this.s.surg.step = 's.' + id; this.rev++; }
  setStep(key: string) { this.s.surg.step = key; this.rev++; }
  setCalls(ids: string[]) { this.calls = ids; this.rev++; }
  waitTime(sec: number): Wait { return { kind: 'time', until: this.s.t + sec }; }
  until(fn: () => boolean, timeout = Infinity): Wait { return { kind: 'until', fn, deadline: this.s.t + timeout }; }
  waitCall(...ids: string[]): Wait { return { kind: 'call', ids }; }
  finish() { this.finished = true; this.paused = true; this.calls = []; this.rev++; }

  // ---------- user API ----------
  call(id: string) {
    if (!this.calls.includes(id)) return;
    this.say('perf', 'c.' + id);
    if (this.wait && this.wait.kind === 'call' && this.wait.ids.includes(id)) this.resume(id);
  }
  awaiting(id: string): boolean {
    return !!this.wait && this.wait.kind === 'call' && this.wait.ids.includes(id);
  }
  act() { if (requestAct(this.s)) this.say('perf', 'm.act_sent'); }
  bga() { if (requestBga(this.s)) this.say('perf', 'm.bga_sent'); }
  drug(id: DrugId) { giveDrug(this.s, id); this.say('perf', 'd.' + id); }
  /** Number of completed grafts, for the surgical-field view. */
  graftCount(): number {
    const k = this.s.surg.step;
    if (k === 's.distal2') return 1;
    if (k === 's.distal3') return 2;
    return ['declamp', 'proximal', 'weanprep', 'weaning', 'post', 'end'].includes(this.phase) ? 3 : 0;
  }
  score(): number { return Math.max(0, 100 - this.penalties.reduce((a, p) => a + p.pts, 0)); }

  // ---------- time ----------
  advance(simDt: number) {
    if (this.paused || this.finished) return;
    let rem = Math.min(simDt, 5);
    while (rem > 1e-9 && !this.paused && !this.finished) {
      const dt = Math.min(0.05, rem);
      rem -= dt;
      step(this.s, dt);
      this.poll();
      this.acc += dt;
      if (this.acc >= 1) { this.acc -= 1; this.everySecond(); }
    }
  }

  private resume(value: any) {
    for (let guard = 0; guard < 100; guard++) {
      const r = this.gen.next(value);
      if (r.done) { this.wait = null; return; }
      this.wait = r.value;
      const v = this.check();
      if (v === undefined) return;
      value = v;
    }
  }
  /** Returns the resume value if the current wait is satisfied, otherwise undefined. */
  private check(): any {
    const w = this.wait;
    if (!w) return undefined;
    if (w.kind === 'time') return this.s.t >= w.until ? true : undefined;
    if (w.kind === 'until') {
      if (w.fn()) return true;
      if (this.s.t >= w.deadline) return false;
    }
    return undefined;
  }
  private poll() {
    const v = this.check();
    if (v !== undefined) this.resume(v);
  }

  /** True once when `cond` has held for `secs`; then silent for `cooldown` seconds. */
  private sustained(id: string, cond: boolean, secs: number, cooldown: number): boolean {
    const t = this.s.t;
    if (!cond) { this.held.delete(id); return false; }
    if (!this.held.has(id)) this.held.set(id, t);
    if (t - this.held.get(id)! < secs) return false;
    if (t < (this.cool.get(id) ?? -1e9)) return false;
    this.cool.set(id, t + cooldown);
    this.held.delete(id);
    return true;
  }
  private rule(id: string, cond: boolean, secs: number, pts: number, cooldown = 300) {
    if (this.sustained(id, cond, secs, cooldown)) this.penalty(id, pts);
  }

  private everySecond() {
    const s = this.s, p = s.pt, h = s.hlm, g = s.surg;
    const cpb = onCpb(s);

    // CPB clock
    if (s.tm.cpbStart === null && g.artCannula && h.flow > 0.5) {
      s.tm.cpbStart = s.t;
      this.lastActOnCpb = s.lab.lastAct ? s.lab.lastAct.tSample : s.t;
      if (p.act < 300) this.critical('clot', 30);
    }

    // critical incidents
    if (s.flags.air) {
      s.flags.air = false;
      h.rpm = 0; h.artOpen = false;
      h.resVol += 500; h.added += 500;
      this.critical('air', 30);
    }
    if (s.flags.linePHighT > 3) {
      s.flags.linePHighT = 0;
      h.rpm = 0;
      this.critical('burst', 25);
    }
    if (cpb && p.act < 300 && this.sustained('clot2', true, 5, 600)) this.critical('clot', 30);

    // alarms (auto slow on new critical alarms)
    const prev = new Set(this.activeAlarms.map((a) => a.id));
    this.activeAlarms = alarms(s);
    if (this.autoSlow && this.speed > 1 && this.activeAlarms.some((a) => a.level === 'crit' && !prev.has(a.id))) this.speed = 1;

    const lowOk = s.flags.flowDown || s.t < s.flags.lowFlowOkUntil;
    const weaning = this.phase === 'weaning';
    if (cpb) {
      const steady = !lowOk && !weaning && this.phase !== 'onbypass';
      this.rule('gas', h.flow > 1 && (h.sweep < 0.2 || h.fio2 < 0.3), 20, 10);
      this.rule('map_low', steady && p.map < 40, 60, 5, 180);
      this.rule('map_high', steady && p.map > 90, 60, 3, 180);
      this.rule('flow_low', steady && h.flow < 0.5 * s.targetFlow, 60, 5, 180);
      this.rule('svo2', steady && p.svo2 < 0.6, 90, 5, 240);
      this.rule('rso2', steady && p.rso2 < 0.8 * p.rso2Base, 60, 5, 240);
      this.rule('pco2', steady && (p.paco2 < 30 || p.paco2 > 50), 180, 3, 300);
      this.rule('po2', steady && p.pao2 < 100, 60, 5, 300);
      this.rule('hct', steady && p.hct < 0.2, 120, 5, 300);
      this.rule('t_art', h.tArt > 37.05, 30, 5, 240);
      this.rule('t_grad', h.flow > 1 && Math.abs(h.tArt - h.tVen) > 10, 30, 5, 240);
      this.rule('res_low', h.resVol < 200, 10, 5, 120);
      this.rule('line_p', h.lineP > 350 && h.lineP <= 500, 5, 5, 120);
      this.rule('act_low', p.act < 400, 30, 10, 300);
      if (s.lab.lastAct) this.lastActOnCpb = Math.max(this.lastActOnCpb, s.lab.lastAct.tSample);
      if (s.lab.actPending) this.lastActOnCpb = Math.max(this.lastActOnCpb, s.lab.actPending.tSample);
      this.rule('act_interval', s.t - this.lastActOnCpb > 30 * 60, 1, 5, 600);
      this.rule('lv', p.lvDist > 0.8, 10, 5, 180);
      this.rule('suck_air', h.suckAir, 180, 2, 300);
      if (this.sustained('pool_say', g.pool > 300, 5, 90)) this.say('surgeon', 'm.pool', undefined, true);
      this.rule('pool', g.pool > 600, 20, 3, 180);
    }
    this.rule('backflow', h.flow < -0.3, 2, 10, 60);
    if (g.xclamp) {
      this.rule('cp_interval', p.rhythm === 'asystole' && s.t - s.cp.lastFlowT > 25 * 60, 1, 5, 300);
      this.rule('cp_activity', p.rhythm === 'vf' && s.cp.doses > 0 && s.t - s.cp.lastFlowT > 30 * 60, 1, 10, 600);
    }
    this.rule('cp_noclamp', s.cp.flow > 0 && !g.xclamp, 15, 5, 120);
    this.rule('cp_retro_p', s.cp.route === 'retro' && s.cp.rootP > 50, 10, 5, 120);
    this.rule('cp_ante_p', s.cp.route === 'ante' && s.cp.pressure > 300, 10, 3, 120);
    this.rule('suction_protamine', p.protamine && (h.suction > 0 || h.vent > 0), 5, 15, 600);

    if (weaning) {
      this.rule('wean_map', p.map < 40, 30, 5, 120);
      if (this.sustained('too_full', p.cvp > 15, 8, 40)) this.say('surgeon', 'm.too_full', undefined, true);
      if (this.sustained('need_vol', p.cvp < 3 && h.flow < 0.5 * s.targetFlow, 8, 40)) this.say('surgeon', 'm.need_volume', undefined, true);
    }

    // history
    this.sampleAcc++;
    if (this.sampleAcc >= 10) {
      this.sampleAcc = 0;
      s.hist.push({
        t: s.t, map: p.map, flow: h.flow, tNP: p.tNP, tBl: p.tBl, svo2: p.svo2 * 100, rso2: p.rso2,
        hct: p.hct * 100, res: h.resVol, cvp: p.cvp,
      });
    }
  }
}

/** Convert a desired flow (L/min) into a pump speed for the configured pump. */
export function rpmForFlow(s: State, q: number): number {
  if (s.cfg.pumpType === 'roller') return q / K.ROLLER_LPR;
  return Math.sqrt(Math.max(0, (s.pt.map + q * K.RC_CENT) / K.KC));
}
