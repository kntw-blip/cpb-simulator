import type { Sim, Script } from '../engine';
import { K, rand } from '../model';

/** On-pump arrested-heart CABG x3 (SVG-RCA, SVG-OM, LITA-LAD). Surgical waiting times are compressed. */
export function* cabg(c: Sim): Script {
  const s = c.s, p = s.pt, h = s.hlm, g = s.surg, cp = s.cp, w = s.cfg.weight;
  const target = s.targetFlow;
  const hypo = s.cfg.targetTemp < 36;

  // ---- 0. pre-bypass checklist ----
  c.setPhase('prep');
  c.say('system', 'm.prep');
  c.setCalls(['checklist_done']);
  for (;;) {
    yield c.waitCall('checklist_done');
    if (s.checklist.every(Boolean)) break;
    c.say('system', 'm.checklist_incomplete');
  }

  // ---- 1. incision, graft harvest, heparin ----
  c.setPhase('incision');
  c.setCalls([]);
  c.say('system', 'm.incision');
  yield c.waitTime(120);
  c.say('surgeon', 'm.heparin_req', undefined, true);
  yield c.waitTime(15);
  p.heparin += K.HEPARIN_PER_KG * w;
  s.tm.heparinT = s.t;
  g.bleed = 20;
  c.setPhase('heparin');
  c.say('anes', 'm.heparin_given', { u: K.HEPARIN_PER_KG * w });
  c.setCalls(['act_ok', 'heparin_more']);
  for (;;) {
    const id: string = yield c.waitCall('act_ok', 'heparin_more');
    if (id === 'heparin_more') {
      yield c.waitTime(10);
      p.heparin += 100 * w;
      s.tm.heparinT = s.t;
      c.say('anes', 'm.heparin_added', { u: 100 * w });
      continue;
    }
    const a = s.lab.lastAct;
    if (!a || a.tSample < s.tm.heparinT!) { c.say('surgeon', 'm.act_not_measured'); c.penalty('act_unmeasured', 10); continue; }
    if (a.tSample < s.tm.heparinT! + 120) { c.say('surgeon', 'm.act_too_early'); continue; }
    if (a.value < 480) { c.say('surgeon', 'm.act_low'); c.penalty('act_low_call', 10); continue; }
    break;
  }

  // ---- 2. cannulation ----
  c.setPhase('cannulation');
  c.setCalls([]);
  g.bleed = 60;
  c.say('surgeon', 'm.art_cannulating');
  yield c.waitTime(40);
  g.artCannula = true;
  c.say('surgeon', 'm.art_cannulated', undefined, true);
  c.setCalls(['art_ok']);
  yield c.waitCall('art_ok');
  c.setCalls([]);
  c.say('surgeon', 'm.ven_cannulating');
  yield c.waitTime(30);
  g.venCannula = true;
  g.bleed = 40;

  // ---- 3. going on bypass ----
  c.setPhase('onbypass');
  c.say('surgeon', 'm.pump_start', undefined, true);
  c.setCalls(['full_flow']);
  for (;;) {
    yield c.waitCall('full_flow');
    if (h.flow >= 0.9 * target && h.venOcc > 0.5) break;
    c.say('surgeon', 'm.not_full_flow');
    c.penalty('full_flow_early', 3);
  }
  c.setCalls([]);
  yield c.waitTime(5);
  p.ventilated = false;
  c.say('anes', 'm.vent_stopped');

  // ---- 4. cooling and cross-clamp ----
  c.setPhase('cooling');
  if (hypo) c.say('surgeon', 'm.cool', { t: s.cfg.targetTemp }, true);
  else c.say('surgeon', 'm.normothermia', undefined, true);
  yield c.waitTime(90);
  c.setPhase('clamp');
  yield* flowDown(c, 'm.clamp_flowdown');
  g.xclamp = true;
  g.ventPlaced = true;
  s.tm.clampStart = s.t;
  cp.target = s.cfg.cpType === 'blood' ? 1000 : 1200;
  c.setPhase('induction');
  c.say('surgeon', 'm.clamped', { v: cp.target }, true);
  const arrested: boolean = yield c.until(() => p.rhythm === 'asystole', 300);
  if (!arrested) {
    c.penalty('cp_slow', 10);
    c.say('surgeon', 'm.cp_hurry', undefined, true);
    yield c.until(() => p.rhythm === 'asystole');
  }
  c.say('surgeon', 'm.arrested');
  yield c.until(() => cp.doseVol >= cp.target * 0.95 && cp.flow === 0);
  c.say('perf', 'm.cp_done', { v: Math.round(cp.doseVol) });
  cp.target = 500;

  // ---- 5. distal anastomoses ----
  c.setPhase('distal');
  g.bleed = 80;
  for (let i = 1; i <= 3; i++) {
    c.setStep('s.distal' + i);
    c.say('surgeon', 'm.distal' + i, undefined, i !== 1);
    if (i === 2) { g.heartLifted = true; g.venFactor = 0.6; }
    if (i === 3 && hypo) { s.flags.rewarm = true; c.say('surgeon', 'm.rewarm', undefined, true); }
    yield c.waitTime(600);
    if (i === 2) { g.heartLifted = false; g.venFactor = 1; c.say('surgeon', 'm.heart_back'); }
  }
  s.flags.rewarm = true;

  // ---- 6. unclamp ----
  c.setPhase('declamp');
  yield* flowDown(c, 'm.declamp_flowdown');
  g.xclamp = false;
  s.tm.clampEnd = s.t;
  p.contractTarget = Math.max(0.4, 1 - 0.6 * p.myoInjury);
  p.contract = 0.5;
  c.say('surgeon', 'm.declamped', undefined, true);
  if (rand(s) < 0.4) {
    p.rhythm = 'vf';
    yield c.waitTime(35);
    c.say('surgeon', 'm.defib');
    yield c.waitTime(8);
    p.rhythm = 'sinus';
  } else {
    p.rhythm = 'brady';
    yield c.waitTime(45);
    p.rhythm = 'sinus';
  }
  c.say('surgeon', 'm.rhythm_ok');

  // ---- 7. proximal anastomoses ----
  c.setPhase('proximal');
  g.bleed = 100;
  c.say('surgeon', 'm.proximal');
  yield c.waitTime(420);
  s.flags.ventOffReq = true;
  c.say('surgeon', 'm.vent_off', undefined, true);
  const ventOff: boolean = yield c.until(() => h.vent === 0, 60);
  if (!ventOff) { c.penalty('vent_off', 3); h.vent = 0; }
  g.ventPlaced = false;
  g.bleed = 60;

  // ---- 8. preparing to wean ----
  c.setPhase('weanprep');
  c.say('surgeon', 'm.wean_prep', undefined, true);
  c.setCalls(['vent_resume', 'wean_ready']);
  for (;;) {
    const id: string = yield c.waitCall('vent_resume', 'wean_ready');
    if (id === 'vent_resume') {
      yield c.waitTime(5);
      p.ventilated = true;
      c.say('anes', 'm.vent_resumed');
      continue;
    }
    const issues: string[] = [];
    if (p.tNP < 36.0 || p.tBl < 35.0) issues.push('m.not_warm');
    if (!p.ventilated) issues.push('m.not_ventilated');
    const b = s.lab.lastBga;
    if (!b || s.t - b.t > 20 * 60) issues.push('m.no_bga');
    if (p.hct < 0.2) issues.push('m.hct_low');
    if (issues.length === 0) break;
    for (const k of issues) c.say('surgeon', k);
    c.penalty('wean_early', 3);
  }

  // ---- 9. weaning ----
  c.setPhase('weaning');
  c.say('surgeon', 'm.wean', undefined, true);
  c.setCalls(['pump_off']);
  for (;;) {
    yield c.waitCall('pump_off');
    if (!(Math.abs(h.flow) < 0.1 && !h.artOpen && h.venOcc === 0)) { c.say('surgeon', 'm.not_off'); continue; }
    if (p.map < 55) { c.say('surgeon', 'm.bp_low', undefined, true); c.penalty('wean_bp', 5); continue; }
    break;
  }
  s.tm.cpbEnd = s.t;
  c.say('surgeon', 'm.off_ok');

  // ---- 10. post-bypass ----
  c.setPhase('post');
  c.setCalls([]);
  g.bleed = 30;
  for (let i = 0; i < 2; i++) {
    yield c.waitTime(i === 0 ? 40 : 60);
    const v0 = h.transfused;
    s.flags.transfuseReq = true;
    c.say('surgeon', 'm.transfuse', undefined, true);
    const ok: boolean = yield c.until(() => h.transfused - v0 >= 80 && Math.abs(h.flow) < 0.05 && !h.artOpen, 150);
    s.flags.transfuseReq = false;
    const given = h.transfused - v0;
    if (!ok) c.penalty('transfuse_slow', 3);
    else if (given > 250) { c.penalty('transfuse_over', 3); c.say('surgeon', 'm.transfuse_over'); }
    else c.say('surgeon', 'm.thanks');
  }
  yield c.waitTime(30);
  g.venCannula = false;
  c.say('surgeon', 'm.ven_decannulated');
  yield c.waitTime(30);
  s.flags.protamineReq = true;
  c.say('anes', 'm.protamine', undefined, true);
  yield c.until(() => h.suction === 0 && h.vent === 0, 20);
  p.protamine = true;
  g.bleed = 10;
  yield c.waitTime(60);
  h.artOpen = false;
  g.artCannula = false;
  c.say('surgeon', 'm.done');
  c.setPhase('end');
  c.finish();
}

function* flowDown(c: Sim, key: string): Script {
  const s = c.s;
  s.flags.flowDown = true;
  c.say('surgeon', key, undefined, true);
  const ok: boolean = yield c.until(() => s.hlm.flow < 0.35 * s.targetFlow, 25);
  if (!ok) c.penalty('flowdown', 5);
  else yield c.waitTime(4);
  s.flags.flowDown = false;
  s.flags.lowFlowOkUntil = s.t + 45;
}
