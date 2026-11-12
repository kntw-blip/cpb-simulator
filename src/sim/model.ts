// Lumped-parameter model of the patient and the heart-lung machine.
// Units: volume mL, main flows L/min, small pumps mL/min, pressure mmHg, time s, temperature °C.
// All constants are teaching approximations. See docs/MODEL.md.

export type PumpType = 'roller' | 'centrifugal';
export type CpType = 'blood' | 'crystalloid';
export type CpRoute = 'ante' | 'retro';
export type Rhythm = 'sinus' | 'brady' | 'vf' | 'asystole';
export type DrugId = 'phenyl' | 'nicard' | 'bicarb' | 'cryst100' | 'cryst250' | 'rbc' | 'heparin';

export interface Config {
  scenario: 'cabg';
  pumpType: PumpType;
  cpType: CpType;
  cpRetro: boolean; // retrograde route available
  targetTemp: number; // nasopharyngeal target during clamp (34 = mild hypothermia, 36 = normothermia)
  hints: boolean;
  seed: number;
  weight: number; // kg
  height: number; // cm
  hct0: number; // fraction
}

export const defaultConfig: Config = {
  scenario: 'cabg',
  pumpType: 'roller',
  cpType: 'blood',
  cpRetro: false,
  targetTemp: 34,
  hints: true,
  seed: 1,
  weight: 65,
  height: 165,
  hct0: 0.38,
};

export const K = {
  CA: 1.5, // arterial compliance mL/mmHg
  CV: 100, // venous compliance mL/mmHg
  SVR0: 17, // mmHg/(L/min)
  SIPHON: 30, // gravity siphon head mmHg
  RV: 6.6, // venous line resistance mmHg/(L/min)
  RART: 40, // oxygenator + filter + cannula resistance mmHg/(L/min)
  RC_CENT: 85, // total outflow resistance seen by the centrifugal pump
  KC: 5e-5, // centrifugal head = KC * rpm^2 (mmHg)
  ROLLER_LPR: 0.027, // roller pump L per revolution
  ROLLER_MAX: 250,
  CENT_MAX: 4000,
  CIRC_FIXED: 600, // tubing/oxygenator volume mL (not in reservoir)
  PRIME_RES: 800, // reservoir level after priming mL
  QMAX_PER_BSA: 6.4 / 1.72,
  CI_TARGET: 2.4, // L/min/m2
  CP_K: 0.02, // mEq per mL of delivered cardioplegia
  COLLATERAL: 120, // mL/min non-coronary collateral return to the LV during clamp
  HEPARIN_PER_KG: 300,
};

export type Site = 'a' | 'v';
export interface Bga {
  site: Site; tSample: number; t: number;
  ph: number; pco2: number; po2: number; hco3: number; be: number;
  hct: number; hb: number; k: number; lac: number; so2: number; temp: number;
}
/** Sensor offsets of the in-line blood gas monitor (displayed = true + offset). */
export interface CdiSet { ph: number; pco2: number; po2: number; k: number; svo2: number; hct: number }
export interface CdiReading {
  art: { ph: number; pco2: number; po2: number; k: number; hco3: number; be: number; sao2: number; temp: number } | null;
  ven: { so2: number; hct: number; hb: number; temp: number } | null;
  do2i: number | null; vo2i: number | null;
}
export interface ActResult { tSample: number; t: number; value: number }
export interface Sample {
  t: number; map: number; flow: number; tNP: number; tBl: number; svo2: number; rso2: number; hct: number; res: number; cvp: number;
}

export interface State {
  cfg: Config;
  t: number;
  bsa: number;
  targetFlow: number;
  rng: number;
  pt: {
    unstressed: number; sa: number; sv: number; rbc: number; hct: number;
    map: number; cvp: number; sys: number; dia: number; hr: number;
    rhythm: Rhythm; contract: number; contractTarget: number; qHeart: number;
    svr: number; svrDrug: number;
    tNP: number; tBl: number;
    pao2: number; paco2: number; sao2: number; svo2: number; pvo2: number; pvco2: number;
    rso2: number; rso2Base: number;
    vo2: number; do2: number;
    k: number; lac: number; bicarb: number;
    heparin: number; heparinSens: number; protamine: boolean; act: number;
    ventilated: boolean; urine: number;
    lvDist: number; myoInjury: number; myoT: number;
  };
  hlm: {
    artOpen: boolean; venOcc: number; rpm: number; flow: number; lineP: number; venFlow: number;
    resVol: number; rbc: number; hct: number;
    fio2: number; sweep: number;
    suction: number; vent: number; ventFlow: number; suckAir: boolean;
    hcOn: boolean; waterSet: number; water: number; tArt: number; tVen: number;
    hemo: number; hemoTotal: number;
    transfused: number; added: number;
  };
  cp: {
    route: CpRoute; flow: number; target: number;
    total: number; doseVol: number; doseEff: number; doses: number;
    lastFlowT: number; pressure: number; rootP: number;
  };
  surg: {
    artCannula: boolean; venCannula: boolean; ventPlaced: boolean;
    xclamp: boolean; heartLifted: boolean; venFactor: number;
    bleed: number; pool: number; poolRbc: number; step: string;
  };
  lab: {
    actPending: ActResult | null; lastAct: ActResult | null;
    bgaPending: Bga | null; lastBga: Bga | null; // arterial
    vbgPending: Bga | null; lastVbg: Bga | null; // venous
  };
  cdi: { off: CdiSet; stored: (CdiSet & { t: number }) | null; calT: number | null; acc: number };
  tm: {
    heparinT: number | null; cpbStart: number | null; cpbEnd: number | null;
    clampStart: number | null; clampEnd: number | null;
  };
  flags: {
    air: boolean; flowDown: boolean; lowFlowOkUntil: number; rewarm: boolean;
    transfuseReq: boolean; protamineReq: boolean; ventOffReq: boolean; linePHighT: number;
  };
  checklist: boolean[];
  hist: Sample[];
}

export const CHECKLIST_N = 8;

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const bsaOf = (w: number, h: number) => 0.007184 * Math.pow(w, 0.425) * Math.pow(h, 0.725);
/** Severinghaus O2 saturation (fraction) from PO2 (mmHg). */
export const satOf = (po2: number) => {
  const p = Math.max(1, po2);
  return 1 / (1 + 23400 / (p * p * p + 150 * p));
};

export function rand(s: State): number {
  // mulberry32
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function createState(cfg: Config): State {
  const bsa = bsaOf(cfg.weight, cfg.height);
  const bloodVol = 70 * cfg.weight;
  const sa = 82 * K.CA;
  const sv = 6 * K.CV;
  const s: State = {
    cfg,
    t: 0,
    bsa,
    targetFlow: K.CI_TARGET * bsa,
    rng: cfg.seed | 0,
    pt: {
      unstressed: bloodVol - sa - sv, sa, sv, rbc: bloodVol * cfg.hct0, hct: cfg.hct0,
      map: 82, cvp: 6, sys: 110, dia: 65, hr: 72,
      rhythm: 'sinus', contract: 1, contractTarget: 1, qHeart: 4.5,
      svr: K.SVR0, svrDrug: 0,
      tNP: 36.2, tBl: 36.4,
      pao2: 250, paco2: 40, sao2: 0.99, svo2: 0.74, pvo2: 40, pvco2: 46,
      rso2: 70, rso2Base: 70,
      vo2: 180, do2: 800,
      k: 4.2, lac: 1.0, bicarb: 0,
      heparin: 0, heparinSens: 1.3, protamine: false, act: 125,
      ventilated: true, urine: 0,
      lvDist: 0, myoInjury: 0, myoT: 36,
    },
    hlm: {
      artOpen: false, venOcc: 0, rpm: 0, flow: 0, lineP: 0, venFlow: 0,
      resVol: K.PRIME_RES, rbc: 0, hct: 0,
      fio2: 0.21, sweep: 0,
      suction: 0, vent: 0, ventFlow: 0, suckAir: false,
      hcOn: false, waterSet: 36, water: 36, tArt: 36, tVen: 36,
      hemo: 0, hemoTotal: 0, transfused: 0, added: 0,
    },
    cp: {
      route: 'ante', flow: 0, target: cfg.cpType === 'blood' ? 1000 : 1200,
      total: 0, doseVol: 0, doseEff: 0, doses: 0, lastFlowT: -1e9, pressure: 0, rootP: 0,
    },
    surg: {
      artCannula: false, venCannula: false, ventPlaced: false, xclamp: false,
      heartLifted: false, venFactor: 1, bleed: 0, pool: 0, poolRbc: 0, step: 's.prep',
    },
    lab: { actPending: null, lastAct: null, bgaPending: null, lastBga: null, vbgPending: null, lastVbg: null },
    cdi: { off: { ph: 0, pco2: 0, po2: 0, k: 0, svo2: 0, hct: 0 }, stored: null, calT: null, acc: 0 },
    tm: { heparinT: null, cpbStart: null, cpbEnd: null, clampStart: null, clampEnd: null },
    flags: {
      air: false, flowDown: false, lowFlowOkUntil: 0, rewarm: false,
      transfuseReq: false, protamineReq: false, ventOffReq: false, linePHighT: 0,
    },
    checklist: new Array(CHECKLIST_N).fill(false),
    hist: [],
  };
  // Patient-to-patient heparin sensitivity (some patients need an additional dose).
  s.pt.heparinSens = 1.05 + rand(s) * 0.45;
  // The in-line monitor starts with an uncorrected sensor error until it is calibrated against a sample.
  const r = () => rand(s) * 2 - 1;
  s.cdi.off = { ph: 0.035 * r(), pco2: 4 * r(), po2: 30 * r(), k: 0.35 * r(), svo2: 3.5 * r(), hct: 2.5 * r() };
  // Settle to a steady pre-bypass state.
  for (let i = 0; i < 20 * 120; i++) step(s, 0.05);
  s.t = 0;
  s.pt.urine = 0;
  s.pt.rso2Base = s.pt.rso2;
  s.hist = [];
  return s;
}

export const onCpb = (s: State) => s.tm.cpbStart !== null && s.tm.cpbEnd === null;

export function step(s: State, dt: number): void {
  const p = s.pt, h = s.hlm, g = s.surg, cp = s.cp, cfg = s.cfg;
  s.t += dt;
  if (!g.artCannula) h.artOpen = false;
  if (!g.venCannula) h.venOcc = 0;

  // ---- volumes, pressures ----
  const vp = p.unstressed + p.sa + p.sv;
  p.hct = clamp(p.rbc / vp, 0.05, 0.6);
  const vc = h.resVol + K.CIRC_FIXED;
  h.hct = clamp(h.rbc / vc, 0, 0.6);
  p.map = Math.max(0, p.sa / K.CA);
  p.cvp = p.sv / K.CV;

  // ---- systemic resistance ----
  p.svrDrug += (0 - p.svrDrug) * dt / 300;
  p.svr = Math.max(4, K.SVR0 * Math.pow(p.hct / cfg.hct0, 0.6) * (1 + 0.03 * (37 - p.tNP)) * (1 + p.svrDrug));
  const qSys = Math.max(0, (p.map - p.cvp) / p.svr);

  // ---- native heart ----
  const beating = p.rhythm === 'sinus' || p.rhythm === 'brady';
  let qhT = 0;
  if (beating && !g.xclamp) {
    const starling = 1 - Math.exp(-Math.max(0, p.cvp) / 5);
    const afterload = clamp(1 - (p.map - 90) / 200, 0.5, 1);
    qhT = p.contract * (p.rhythm === 'brady' ? 0.6 : 1) * K.QMAX_PER_BSA * s.bsa * starling * afterload;
    p.contract += (p.contractTarget - p.contract) * dt / 240;
  }
  p.qHeart += (qhT - p.qHeart) * Math.min(1, dt / 1.5);
  if (p.qHeart < 0.01) p.qHeart = 0;
  p.hr = p.rhythm === 'sinus' ? clamp(72 + (80 - p.map) * 0.3, 55, 110) : p.rhythm === 'brady' ? 40 : 0;
  const pp = p.hr > 0 ? Math.min(80, (p.qHeart * 1000 / p.hr) / 1.4) : 0;
  p.sys = p.map + pp * 0.6;
  p.dia = Math.max(0, p.map - pp * 0.4);

  // ---- arterial pump ----
  let qp = 0;
  let lineTarget = 0;
  if (cfg.pumpType === 'roller') {
    const q = h.rpm * K.ROLLER_LPR;
    if (h.artOpen) { qp = q; lineTarget = p.map + q * K.RART; }
    else lineTarget = q > 0.05 ? 900 : (g.artCannula ? p.map : 0);
  } else {
    const head = K.KC * h.rpm * h.rpm;
    if (h.artOpen) {
      qp = Math.max(-3, (head - p.map) / K.RC_CENT);
      lineTarget = p.map + Math.max(0, qp) * K.RART;
    } else lineTarget = head;
  }
  if (qp > 0 && h.resVol <= 20) { s.flags.air = true; qp = 0; }
  h.flow = qp;
  h.lineP += (lineTarget - h.lineP) * Math.min(1, dt / 0.5);
  if (h.lineP > 500) s.flags.linePHighT += dt; else s.flags.linePHighT = 0;

  // ---- venous drainage ----
  const collapse = clamp((p.cvp + 4) / 4, 0, 1);
  const qv = h.venOcc * g.venFactor * Math.max(0, p.cvp + K.SIPHON) * collapse / K.RV;
  h.venFlow = qv;

  // ---- small flows (mL in this step) ----
  const L = 1000 / 60 * dt; // mL per (L/min) during dt
  const m = dt / 60; // mL per (mL/min) during dt
  const hctP = p.hct, hctC = h.hct;

  const bleed = g.bleed * m;
  const suck = Math.min(h.suction * m, g.pool + bleed);
  h.suckAir = h.suction > 2 * g.bleed + 60 && g.pool < 5;
  const poolHct = g.pool > 1 ? g.poolRbc / g.pool : hctP;

  const arrestedOrVf = p.rhythm === 'vf' || p.rhythm === 'asystole';
  const lvFilling = g.xclamp || (onCpb(s) && arrestedOrVf);
  const ventAvail = g.ventPlaced ? (lvFilling ? K.COLLATERAL + p.lvDist * 300 : 400) : 0;
  const ventF = Math.min(h.vent, ventAvail);
  h.ventFlow = ventF;
  const vent = ventF * m;
  if (lvFilling) p.lvDist = clamp(p.lvDist + ((K.COLLATERAL - ventF) / K.COLLATERAL) * dt / 180, 0, 1);
  else p.lvDist = clamp(p.lvDist - dt / 60, 0, 1);

  // cardioplegia
  const cpVol = cp.flow * m;
  const bloodFrac = cfg.cpType === 'blood' ? 0.8 : 0;
  const cpBlood = Math.min(cpVol * bloodFrac, Math.max(0, h.resVol));
  if (cp.flow > 0) {
    if (s.t - cp.lastFlowT > 120) { cp.doseVol = 0; cp.doseEff = 0; cp.doses++; }
    cp.lastFlowT = s.t;
    cp.total += cpVol;
    cp.doseVol += cpVol;
    p.k += cpVol * K.CP_K / (0.3 * cfg.weight);
    if (g.xclamp) {
      cp.doseEff += cpVol;
      p.myoT += (8 - p.myoT) * Math.min(1, cpVol / 600);
      if (p.rhythm !== 'asystole') {
        if (cp.doseEff > (cfg.cpType === 'blood' ? 350 : 400)) p.rhythm = 'asystole';
        else if (cp.doseEff > 150 && p.rhythm !== 'vf') p.rhythm = 'brady';
      }
    }
    if (cp.route === 'ante') { cp.rootP = cp.flow * 0.27; cp.pressure = 30 + cp.flow * 0.5; }
    else { cp.rootP = cp.flow * 0.2; cp.pressure = cp.rootP + cp.flow * 0.4; }
  } else { cp.pressure = 0; cp.rootP = 0; }
  p.k += (4.2 - p.k) * dt / 1500;

  // myocardium during cross-clamp
  if (g.xclamp) {
    p.myoT += (p.tNP - p.myoT) * dt / 900;
    const sinceMin = (s.t - cp.lastFlowT) / 60;
    if (p.rhythm === 'asystole') {
      p.myoInjury += (0.001 + 0.01 * Math.max(0, (sinceMin - 25) / 5)) * dt / 60;
      if (sinceMin > 30) p.rhythm = 'vf'; // electrical activity returns
    } else p.myoInjury += 0.03 * dt / 60;
    p.myoInjury = clamp(p.myoInjury, 0, 1);
  } else p.myoT += (p.tNP - p.myoT) * dt / 120;

  const urine = (onCpb(s) ? 2.0 : 1.2) * m;
  const hemo = Math.min(h.hemo * m, Math.max(0, h.resVol - 100));

  // ---- integrate volumes ----
  const qpPos = Math.max(0, qp), qpNeg = Math.max(0, -qp);
  const cpToArt = !g.xclamp && cp.route === 'ante';
  p.sa += (qpPos - qpNeg + p.qHeart - qSys) * L + (cpToArt ? cpVol : 0);
  p.sv += (qSys - p.qHeart - qv) * L - bleed - vent - urine + (cpToArt ? 0 : cpVol);
  if (p.sa < 0) { p.sv += p.sa; p.sa = 0; }
  h.resVol += (qv - qpPos + qpNeg) * L + suck + vent - cpBlood - hemo;
  if (h.resVol < 0) h.resVol = 0;

  // red cells
  const rbcOut = qpPos * L * hctC + cpBlood * hctC; // circuit -> patient
  const rbcIn = (qv + qpNeg) * L * hctP + vent * hctP; // patient -> circuit
  const rbcBleed = bleed * hctP;
  const rbcSuck = suck * poolHct;
  p.rbc += rbcOut - rbcIn - rbcBleed;
  h.rbc += rbcIn - rbcOut + rbcSuck;
  g.pool += bleed - suck; g.poolRbc += rbcBleed - rbcSuck;
  if (g.pool < 0) { g.pool = 0; g.poolRbc = 0; }
  if (p.rbc < 0) p.rbc = 0;
  if (h.rbc < 0) h.rbc = 0;
  p.urine += urine;
  h.hemoTotal += hemo;
  h.transfused += qpPos * L;

  // ---- temperature ----
  const wr = 2.5 / 60 * dt;
  if (h.hcOn) h.water += clamp(h.waterSet - h.water, -wr, wr);
  h.tVen = 0.4 * p.tNP + 0.6 * p.tBl;
  if (qpPos > 0.2) {
    h.tArt = h.hcOn ? h.tVen + 0.5 * (h.water - h.tVen) : h.tVen - 0.3;
    p.tNP += 0.055 * qpPos * (h.tArt - p.tNP) * dt / 60;
    p.tBl += 0.0185 * qpPos * (h.tArt - p.tBl) * dt / 60;
  } else h.tArt += (h.tVen - h.tArt) * dt / 60;
  if (onCpb(s)) { p.tNP -= 0.004 * dt / 60; p.tBl -= 0.003 * dt / 60; }
  const tBody = 0.4 * p.tNP + 0.6 * p.tBl;

  // ---- oxygen ----
  const qTot = qpPos + p.qHeart;
  const hb = p.hct * 33.3;
  p.vo2 = 110 * s.bsa * Math.pow(2.2, (tBody - 37) / 10);
  const eO2 = clamp(h.sweep / 0.3, 0, 1) * 0.98;
  const sOx = p.svo2 + (satOf(h.fio2 * 500) - p.svo2) * eO2;
  const sLung = p.ventilated ? 0.99 : p.svo2;
  const pvo2 = 26.6 * Math.pow(Math.max(0.02, p.svo2) / Math.max(0.02, 1 - p.svo2), 1 / 2.7);
  const poOx = Math.max(pvo2, h.fio2 * 500 * eO2);
  const poLung = p.ventilated ? 250 : pvo2;
  p.pvo2 = pvo2;
  if (qTot > 0.2) {
    const saT = (qpPos * sOx + p.qHeart * sLung) / qTot;
    const poT = saT > 0.97 ? (qpPos * poOx + p.qHeart * poLung) / qTot
      : 26.6 * Math.pow(saT / Math.max(0.02, 1 - saT), 1 / 2.7);
    p.sao2 += (saT - p.sao2) * Math.min(1, dt / 8);
    p.pao2 += (poT - p.pao2) * Math.min(1, dt / 8);
  }
  const cao2 = 1.34 * hb * p.sao2 + 0.003 * p.pao2;
  p.do2 = qTot * cao2 * 10;
  const svT = qTot > 0.2 ? clamp(p.sao2 - p.vo2 / Math.max(1, qTot * 1.34 * hb * 10), 0.15, 0.95) : 0.2;
  p.svo2 += (svT - p.svo2) * Math.min(1, dt / 30);

  // ---- CO2 ----
  const vco2 = 0.8 * p.vo2;
  const va = (p.ventilated ? 3.3 * clamp(p.qHeart / 2, 0, 1) : 0)
    + (qpPos > 0.3 ? 0.95 * h.sweep * clamp(qpPos / 1.5, 0, 1) : 0);
  p.paco2 = clamp(p.paco2 + ((0.863 * vco2 - va * p.paco2) / 20) * dt / 60, 10, 120);
  p.pvco2 = p.paco2 + clamp(6 * (vco2 / 150) * (4.5 / Math.max(qTot, 0.5)), 2, 25);

  // ---- cerebral oximetry ----
  const auto = p.map >= 50 ? 1 + Math.max(0, p.map - 100) * 0.005 : Math.max(0.15, p.map / 50);
  const cbf = clamp(auto * (1 + 0.03 * (p.paco2 - 40)), 0.1, 2.2) * Math.pow(cfg.hct0 / p.hct, 0.5)
    * Math.pow(1.6, (p.tNP - 37) / 10);
  const cmro2 = Math.pow(2.4, (p.tNP - 37) / 10);
  const ext = clamp(0.35 * cmro2 / (cbf * (p.hct / cfg.hct0) * Math.max(0.3, p.sao2 / 0.98)), 0, 0.92);
  const rT = (0.3 * p.sao2 + 0.7 * p.sao2 * (1 - ext)) * 100;
  p.rso2 += (rT - p.rso2) * Math.min(1, dt / 20);

  // ---- metabolism / coagulation ----
  const do2i = p.do2 / s.bsa;
  const crit = 270 * Math.pow(2.2, (tBody - 37) / 10);
  if (do2i < crit) p.lac += 0.08 * (1 - do2i / crit) * dt / 60;
  else p.lac += (1.0 - p.lac) * dt / 5400;
  p.heparin *= Math.exp(-dt / (p.protamine ? 40 : 100 * 60 / Math.LN2));
  p.act = (125 + p.heparinSens * p.heparin / cfg.weight) * (1 + 0.025 * (37 - p.tNP))
    * (1 + 0.6 * Math.max(0, cfg.hct0 - p.hct));

  // ---- lab results arriving ----
  if (s.lab.actPending && s.t >= s.lab.actPending.t) { s.lab.lastAct = s.lab.actPending; s.lab.actPending = null; }
  if (s.lab.bgaPending && s.t >= s.lab.bgaPending.t) { s.lab.lastBga = s.lab.bgaPending; s.lab.bgaPending = null; }
  if (s.lab.vbgPending && s.t >= s.lab.vbgPending.t) { s.lab.lastVbg = s.lab.vbgPending; s.lab.vbgPending = null; }

  // ---- in-line monitor sensor drift (random walk, once per second) ----
  s.cdi.acc += dt;
  if (s.cdi.acc >= 1) {
    s.cdi.acc -= 1;
    const o = s.cdi.off, w = () => (rand(s) * 2 - 1) * 0.22; // ~ sd 0.13 per sqrt(s)
    o.ph += 0.002 * w(); o.pco2 += 0.2 * w(); o.po2 += 1.5 * w(); o.k += 0.015 * w(); o.svo2 += 0.15 * w(); o.hct += 0.1 * w();
  }
}

export const hco3Of = (s: State) => 24.5 - (s.pt.lac - 1) + s.pt.bicarb;
export const phOf = (s: State) => 6.1 + Math.log10(hco3Of(s) / (0.03 * s.pt.paco2));

export function requestAct(s: State): boolean {
  if (s.lab.actPending) return false;
  s.lab.actPending = { tSample: s.t, t: s.t + 90, value: Math.min(999, Math.round(s.pt.act * (0.97 + rand(s) * 0.06))) };
  return true;
}

const beOf = (ph: number, hco3: number) => 0.93 * (hco3 - 24.4 + 14.8 * (ph - 7.4));
const phFrom = (hco3: number, pco2: number) => 6.1 + Math.log10(hco3 / (0.03 * pco2));

/** Draw a blood sample for the blood gas analyser. Arterial: oxygenator outlet / arterial line. Venous: venous line. */
export function requestBga(s: State, site: Site = 'a'): boolean {
  if (site === 'a' ? s.lab.bgaPending : s.lab.vbgPending) return false;
  const p = s.pt;
  const hco3 = hco3Of(s) + (site === 'v' ? 1 : 0);
  const pco2 = site === 'a' ? p.paco2 : p.pvco2;
  const ph = phFrom(hco3, pco2);
  const b: Bga = {
    site, tSample: s.t, t: s.t + 60,
    ph, pco2, po2: site === 'a' ? p.pao2 : p.pvo2, hco3, be: beOf(ph, hco3),
    hct: p.hct * 100, hb: p.hct * 33.3, k: p.k, lac: p.lac, so2: (site === 'a' ? p.sao2 : p.svo2) * 100, temp: p.tNP,
  };
  if (site === 'a') s.lab.bgaPending = b; else s.lab.vbgPending = b;
  return true;
}

/** What the in-line monitor shows now (true value + sensor offset). Sides without blood flow read null. */
export function cdiRead(s: State): CdiReading {
  const p = s.pt, h = s.hlm, o = s.cdi.off;
  const cpb = onCpb(s);
  const art = cpb && h.flow > 0.3 ? (() => {
    const hco3 = hco3Of(s), pco2 = Math.max(5, p.paco2 + o.pco2), ph = phOf(s) + o.ph, po2 = Math.max(10, p.pao2 + o.po2);
    return { ph, pco2, po2, k: Math.max(1, p.k + o.k), hco3, be: beOf(ph, hco3), sao2: satOf(po2) * 100, temp: h.tArt };
  })() : null;
  const ven = cpb && h.venFlow > 0.3 ? (() => {
    const hct = clamp(p.hct * 100 + o.hct, 5, 60);
    return { so2: clamp(p.svo2 * 100 + o.svo2, 10, 99), hct, hb: hct / 3, temp: h.tVen };
  })() : null;
  let do2i: number | null = null, vo2i: number | null = null;
  if (art && ven) {
    do2i = h.flow * (1.34 * ven.hb * art.sao2 / 100 + 0.003 * art.po2) * 10 / s.bsa;
    vo2i = Math.max(0, h.flow * 1.34 * ven.hb * (art.sao2 - ven.so2) / 100 * 10 / s.bsa);
  }
  return { art, ven, do2i, vo2i };
}

/** "Store": remember the displayed values at the moment the calibration samples are drawn. */
export function cdiStore(s: State): boolean {
  const r = cdiRead(s);
  if (!r.art && !r.ven) return false;
  s.cdi.stored = {
    t: s.t,
    ph: r.art ? r.art.ph : NaN, pco2: r.art ? r.art.pco2 : NaN, po2: r.art ? r.art.po2 : NaN, k: r.art ? r.art.k : NaN,
    svo2: r.ven ? r.ven.so2 : NaN, hct: r.ven ? r.ven.hct : NaN,
  };
  return true;
}

/** In-vivo recalibration: shift each sensor by (stored display - analyser result). */
export function cdiCalibrate(s: State): 'ok' | 'no_store' | 'no_sample' {
  const st = s.cdi.stored, o = s.cdi.off;
  if (!st) return 'no_store';
  const a = s.lab.lastBga && s.lab.lastBga.tSample >= st.t ? s.lab.lastBga : null;
  const v = s.lab.lastVbg && s.lab.lastVbg.tSample >= st.t ? s.lab.lastVbg : null;
  if (!a && !v) return 'no_sample';
  const fix = (key: keyof CdiSet, lab: number) => { if (isFinite(st[key])) o[key] -= st[key] - lab; };
  if (a) { fix('ph', a.ph); fix('pco2', a.pco2); fix('po2', a.po2); fix('k', a.k); }
  if (v) { fix('svo2', v.so2); fix('hct', v.hct); } else if (a) fix('hct', a.hct);
  s.cdi.stored = null;
  s.cdi.calT = s.t;
  return 'ok';
}

export function giveDrug(s: State, id: DrugId): void {
  const p = s.pt, h = s.hlm;
  switch (id) {
    case 'phenyl': p.svrDrug = Math.min(1.2, p.svrDrug + 0.25); break;
    case 'nicard': p.svrDrug = Math.max(-0.5, p.svrDrug - 0.2); break;
    case 'bicarb': p.bicarb += 20 / (0.3 * s.cfg.weight); break;
    case 'cryst100': h.resVol += 100; h.added += 100; break;
    case 'cryst250': h.resVol += 250; h.added += 250; break;
    case 'rbc': h.resVol += 280; h.rbc += 280 * 0.58; h.added += 280; break;
    case 'heparin': p.heparin += 5000; break;
  }
}

export interface Alarm { id: string; level: 'warn' | 'crit' }

export function alarms(s: State): Alarm[] {
  const a: Alarm[] = [];
  const p = s.pt, h = s.hlm;
  const cpb = onCpb(s);
  if (s.surg.venCannula || cpb) {
    if (h.resVol < 200) a.push({ id: 'res_crit', level: 'crit' });
    else if (h.resVol < 400) a.push({ id: 'res_low', level: 'warn' });
  }
  if (h.lineP > 350) a.push({ id: 'line_p', level: 'crit' });
  if (h.flow < -0.1) a.push({ id: 'backflow', level: 'crit' });
  if (cpb) {
    if (h.flow > 1 && (h.sweep < 0.2 || h.fio2 < 0.3)) a.push({ id: 'gas', level: 'crit' });
    if (p.map < 40 && !s.flags.flowDown && s.t > s.flags.lowFlowOkUntil) a.push({ id: 'map_low', level: 'warn' });
    if (p.map > 90) a.push({ id: 'map_high', level: 'warn' });
    if (p.svo2 < 0.6) a.push({ id: 'svo2', level: 'warn' });
    if (p.rso2 < 0.8 * p.rso2Base) a.push({ id: 'rso2', level: 'warn' });
    if (h.tArt > 37.05) a.push({ id: 't_art', level: 'warn' });
    if (s.lab.lastAct && s.lab.lastAct.value < 480) a.push({ id: 'act', level: 'warn' });
    if (p.lvDist > 0.6) a.push({ id: 'lv', level: 'warn' });
  }
  if (s.surg.xclamp && p.rhythm === 'asystole' && s.t - s.cp.lastFlowT > 20 * 60) a.push({ id: 'cp_due', level: 'warn' });
  if (s.cp.route === 'retro' && s.cp.rootP > 45) a.push({ id: 'cp_p', level: 'warn' });
  return a;
}
