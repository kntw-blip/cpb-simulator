import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/engine';
import { createState, defaultConfig, step, Config, cdiRead, cdiStore, cdiCalibrate, requestBga } from '../src/sim/model';
import { runScenario } from './autopilot';

describe('patient model', () => {
  it('settles to a plausible pre-bypass state', () => {
    const s = createState(defaultConfig);
    expect(s.pt.map).toBeGreaterThan(65);
    expect(s.pt.map).toBeLessThan(100);
    expect(s.pt.cvp).toBeGreaterThan(3);
    expect(s.pt.cvp).toBeLessThan(10);
    expect(s.pt.svo2).toBeGreaterThan(0.65);
    expect(s.pt.rso2).toBeGreaterThan(60);
    expect(s.pt.paco2).toBeGreaterThan(33);
    expect(s.pt.paco2).toBeLessThan(45);
  });

  it('conserves total volume', () => {
    const s = createState(defaultConfig);
    const total = () => s.pt.unstressed + s.pt.sa + s.pt.sv + s.hlm.resVol + s.surg.pool + s.pt.urine;
    const v0 = total();
    s.surg.artCannula = s.surg.venCannula = true;
    s.hlm.artOpen = true; s.hlm.venOcc = 1; s.hlm.rpm = 150; s.hlm.sweep = 2; s.hlm.fio2 = 0.6;
    s.surg.bleed = 50; s.hlm.suction = 30;
    for (let i = 0; i < 20 * 300; i++) step(s, 0.05);
    expect(Math.abs(total() - v0)).toBeLessThan(1);
  });

  it('centrifugal pump flows backwards when the line is open at low rpm', () => {
    const s = createState({ ...defaultConfig, pumpType: 'centrifugal' });
    s.surg.artCannula = true; s.hlm.artOpen = true; s.hlm.rpm = 0;
    for (let i = 0; i < 40; i++) step(s, 0.05);
    expect(s.hlm.flow).toBeLessThan(-0.2);
  });
});

describe('in-line blood gas monitor', () => {
  it('reads with an offset until calibrated against arterial and venous samples', () => {
    const s = createState(defaultConfig);
    s.surg.artCannula = s.surg.venCannula = true;
    s.pt.heparin = 300 * 65; s.tm.cpbStart = 0;
    s.hlm.artOpen = true; s.hlm.venOcc = 1; s.hlm.rpm = 152; s.hlm.sweep = 2.5; s.hlm.fio2 = 0.6;
    for (let i = 0; i < 20 * 240; i++) step(s, 0.05);
    s.cdi.off = { ph: 0.04, pco2: 5, po2: 30, k: 0.4, svo2: 4, hct: 3 };
    expect(cdiCalibrate(s)).toBe('no_store');
    expect(cdiStore(s)).toBe(true);
    expect(cdiCalibrate(s)).toBe('no_sample');
    requestBga(s, 'a'); requestBga(s, 'v');
    for (let i = 0; i < 20 * 70; i++) step(s, 0.05);
    expect(s.lab.lastVbg!.po2).toBeLessThan(60);
    expect(s.lab.lastVbg!.pco2).toBeGreaterThan(s.lab.lastBga!.pco2);
    expect(cdiCalibrate(s)).toBe('ok');
    const r = cdiRead(s);
    expect(Math.abs(r.art!.pco2 - s.pt.paco2)).toBeLessThan(1.5);
    expect(Math.abs(r.ven!.so2 - s.pt.svo2 * 100)).toBeLessThan(1.5);
    expect(Math.abs(r.ven!.hct - s.pt.hct * 100)).toBeLessThan(1);
  });

  it('shows nothing without blood flow', () => {
    const s = createState(defaultConfig);
    const r = cdiRead(s);
    expect(r.art).toBeNull();
    expect(r.ven).toBeNull();
  });
});

const variants: Partial<Config>[] = [
  { pumpType: 'roller', cpType: 'blood' },
  { pumpType: 'centrifugal', cpType: 'blood' },
  { pumpType: 'roller', cpType: 'crystalloid', targetTemp: 36 },
  { pumpType: 'centrifugal', cpType: 'crystalloid', seed: 7 },
];

describe('CABG scenario with ideal operation', () => {
  for (const v of variants) {
    it(`completes with a high score: ${JSON.stringify(v)}`, () => {
      const sim = new Sim({ ...defaultConfig, ...v });
      runScenario(sim);
      const s = sim.s;
      if (!sim.finished || sim.score() < 90) {
        console.log('phase', sim.phase, 't', s.t, sim.penalties, sim.log.slice(-6));
      }
      expect(sim.finished).toBe(true);
      expect(sim.score()).toBeGreaterThanOrEqual(90);
      expect(s.tm.cpbEnd! - s.tm.cpbStart!).toBeGreaterThan(40 * 60);
      expect(s.pt.map).toBeGreaterThan(55);
    });
  }

  it('penalises going on bypass without gas flow', () => {
    const sim = new Sim(defaultConfig);
    const s = sim.s;
    s.surg.artCannula = s.surg.venCannula = true;
    s.pt.heparin = 300 * 65;
    s.hlm.artOpen = true; s.hlm.venOcc = 1; s.hlm.rpm = 150;
    for (let i = 0; i < 60; i++) sim.advance(1);
    expect(sim.penalties.some((p) => p.id === 'gas')).toBe(true);
  });

  it('flags an air incident when the reservoir is emptied', () => {
    const sim = new Sim(defaultConfig);
    const s = sim.s;
    s.surg.artCannula = true;
    s.pt.heparin = 300 * 65;
    s.hlm.artOpen = true; s.hlm.rpm = 200; s.hlm.sweep = 2; s.hlm.fio2 = 0.6;
    for (let i = 0; i < 60; i++) sim.advance(1);
    expect(sim.penalties.some((p) => p.id === 'air')).toBe(true);
  });
});
