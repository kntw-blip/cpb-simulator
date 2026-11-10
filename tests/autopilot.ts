import { Sim, rpmForFlow } from '../src/sim/engine';
import { giveDrug, requestAct, requestBga, onCpb } from '../src/sim/model';

/** A scripted "ideal perfusionist". Call once per simulated second. */
export function makeAutopilot(sim: Sim) {
  const s = sim.s, p = s.pt, h = s.hlm, cp = s.cp, g = s.surg;
  const tgt = s.targetFlow;
  let flowCmd = 0;
  let lastPressor = -1e9;
  let lastAct = -1e9;
  let lastVol = -1e9;
  let transfuse0: number | null = null;
  let weanDone = false;
  let cpRun = false;
  let hepFor = -1;
  const setFlow = (q: number) => { flowCmd = q; h.rpm = q <= 0 ? 0 : rpmForFlow(s, q); };
  const call = (id: string) => { if (sim.awaiting(id)) sim.call(id); };

  return function tick() {
    if (sim.criticalPending) { sim.criticalPending = null; sim.paused = false; }
    const cpb = onCpb(s);
    switch (sim.phase) {
      case 'prep': s.checklist.fill(true); call('checklist_done'); break;
      case 'heparin': {
        const hep = s.tm.heparinT!;
        const a = s.lab.lastAct;
        if (a && a.tSample >= hep + 120) {
          if (a.value >= 480) call('act_ok'); else call('heparin_more');
        } else if (!s.lab.actPending && s.t >= hep + 125) requestAct(s);
        break;
      }
      case 'cannulation': call('art_ok'); break;
      case 'onbypass': {
        h.fio2 = 0.6; h.sweep = 2.5; h.hcOn = true; h.suction = 150;
        if (s.cfg.pumpType === 'centrifugal' && !h.artOpen) { h.rpm = 1500; h.artOpen = true; flowCmd = 0.3; break; }
        h.artOpen = true;
        h.venOcc = Math.min(1, h.venOcc + 0.1);
        setFlow(Math.min(tgt, flowCmd + 0.3));
        if (h.flow >= 0.95 * tgt && h.venOcc >= 1) call('full_flow');
        break;
      }
      case 'weanprep': {
        if (!p.ventilated) call('vent_resume');
        const b = s.lab.lastBga;
        const warm = p.tNP >= 36.0 && p.tBl >= 35.0;
        if (warm && !s.lab.bgaPending && (!b || s.t - b.t > 15 * 60)) requestBga(s);
        if (warm && p.ventilated && b && s.t - b.t < 15 * 60) call('wean_ready');
        break;
      }
      case 'weaning': {
        if (!weanDone) {
          // fill the heart by partially occluding the venous line, then hand over flow to the heart
          if (p.cvp < 8) h.venOcc = Math.max(0, h.venOcc - 0.03);
          else if (p.cvp > 10) h.venOcc = Math.min(1, h.venOcc + 0.02);
          const q = Math.max(0, tgt - p.qHeart * 1.05);
          if (q < 0.6 && p.cvp >= 7) weanDone = true;
          else setFlow(Math.max(0.5, q));
        } else {
          h.venOcc = 0;
          if (s.cfg.pumpType === 'centrifugal') { h.artOpen = false; h.rpm = 0; flowCmd = 0; }
          else { setFlow(0); h.artOpen = false; }
          if (p.map >= 60) call('pump_off');
          else if (s.t - lastPressor > 40) { giveDrug(s, 'phenyl'); lastPressor = s.t; }
        }
        break;
      }
      case 'post': {
        if (s.flags.transfuseReq) {
          if (transfuse0 === null) transfuse0 = h.transfused;
          if (h.transfused - transfuse0 < 100) {
            if (s.cfg.pumpType === 'centrifugal') { if (!h.artOpen) { h.rpm = rpmForFlow(s, 0.1); h.artOpen = true; } else setFlow(0.5); }
            else { h.artOpen = true; setFlow(0.5); }
          } else {
            if (s.cfg.pumpType === 'centrifugal') { h.artOpen = false; h.rpm = 0; } else { setFlow(0); h.artOpen = false; }
          }
        } else transfuse0 = null;
        if (s.flags.protamineReq) { h.suction = 0; h.vent = 0; }
        break;
      }
    }

    // steady-state management while on full bypass
    if (cpb && ['cooling', 'clamp', 'induction', 'distal', 'declamp', 'proximal', 'weanprep'].includes(sim.phase)) {
      let q = s.flags.flowDown ? 0.25 * tgt : tgt;
      if (!s.flags.flowDown && h.resVol < 500) {
        q = 0.8 * tgt;
        if (s.t - lastVol > 20) { giveDrug(s, 'cryst250'); lastVol = s.t; }
      }
      if (!s.flags.flowDown && p.svo2 < 0.66) q = Math.min(1.25 * tgt, q * 1.15);
      setFlow(q);
      h.hemo = p.hct < 0.25 && h.resVol > 900 ? 60 : 0;
      if (p.hct < 0.21 && s.t - lastVol > 120) { giveDrug(s, 'rbc'); lastVol = s.t; }
      h.suction = g.pool > 60 ? 300 : 100;
      h.vent = g.ventPlaced && !s.flags.ventOffReq ? 200 : 0;
      // temperature
      const maxWater = 2 * 36.8 - h.tVen;
      if (s.flags.rewarm) h.waterSet = Math.min(40, maxWater);
      else if (s.cfg.targetTemp < 36) h.waterSet = p.tNP > s.cfg.targetTemp + 0.3 ? 28 : s.cfg.targetTemp;
      else h.waterSet = Math.min(37, maxWater);
      // gas: steer PaCO2 toward 40
      if (Math.floor(s.t) % 30 === 0) h.sweep = Math.min(6, Math.max(0.5, h.sweep * (1 + (p.paco2 - 40) * 0.01)));
      // pressure
      if (!s.flags.flowDown && p.map < 50 && s.t - lastPressor > 60) { giveDrug(s, 'phenyl'); lastPressor = s.t; }
      // anticoagulation
      if (s.t - lastAct > 20 * 60 && !s.lab.actPending) { requestAct(s); lastAct = s.t; }
      const la = s.lab.lastAct;
      if (la && la.value < 480 && la.tSample !== hepFor) { giveDrug(s, 'heparin'); hepFor = la.tSample; lastAct = s.t - 17 * 60; }
      // cardioplegia
      if (g.xclamp) {
        if (!cpRun && (sim.phase === 'induction' ? cp.doseVol < cp.target : s.t - cp.lastFlowT > 20 * 60)) cpRun = true;
        if (cpRun && cp.flow > 0 && cp.doseVol >= cp.target) cpRun = false;
        cp.flow = cpRun ? 300 : 0;
      } else cp.flow = 0;
    }
  };
}

export function runScenario(sim: Sim, maxSeconds = 4 * 3600) {
  const tick = makeAutopilot(sim);
  for (let i = 0; i < maxSeconds && !sim.finished; i++) {
    tick();
    sim.paused = sim.finished;
    sim.advance(1);
  }
}
