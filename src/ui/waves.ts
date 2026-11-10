import type { State } from '../sim/model';
import { fitCanvas } from './dom';

const G = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));

function ecg(phi: number): number {
  return 0.12 * G(phi, 0.12, 0.03) - 0.12 * G(phi, 0.235, 0.01) + 1.0 * G(phi, 0.25, 0.012)
    - 0.2 * G(phi, 0.268, 0.012) + 0.28 * G(phi, 0.45, 0.06);
}
function artShape(phi: number): number {
  const x = (phi - 0.3 + 1) % 1;
  if (x < 0.12) return Math.sin((x / 0.12) * Math.PI / 2);
  return Math.exp(-(x - 0.12) / 0.38) + 0.07 * G(x, 0.34, 0.03);
}

/** Sweeping three-trace monitor (ECG, arterial pressure, CVP). */
export class WaveMonitor {
  private x = 0;
  private phi = 0;
  private time = 0;
  private last: number[] | null = null;
  private lastW = 0;
  constructor(private canvas: HTMLCanvasElement) {}

  private values(s: State): number[] {
    const p = s.pt, t = this.time;
    let e = 0;
    if (p.rhythm === 'sinus' || p.rhythm === 'brady') e = ecg(this.phi);
    else if (p.rhythm === 'vf') e = 0.25 * Math.sin(t * 31) + 0.18 * Math.sin(t * 43.7 + 1) + 0.12 * Math.sin(t * 17.3 + 2);
    else e = 0.01 * Math.sin(t * 3);
    let a: number;
    if (p.hr > 0 && p.sys - p.dia > 3) a = p.dia + (p.sys - p.dia) * artShape(this.phi);
    else {
      const ripple = s.cfg.pumpType === 'roller' && s.hlm.flow > 0.2 ? 1.5 * Math.sin(t * 2 * Math.PI * (s.hlm.rpm / 60) * 2) : 0;
      a = p.map + ripple;
    }
    const c = p.cvp + (p.hr > 0 ? 1.2 * Math.sin(this.phi * 2 * Math.PI) : 0);
    return [e, a, c];
  }

  draw(s: State, dt: number, running: boolean) {
    const { ctx, w, h } = fitCanvas(this.canvas);
    if (w !== this.lastW) { this.lastW = w; this.x = 0; this.last = null; ctx.clearRect(0, 0, w, h); }
    if (!running) return;
    const rows = [
      { color: '#37e06c', min: -0.4, max: 1.2 },
      { color: '#ff5252', min: 0, max: 150 },
      { color: '#4cc9f0', min: -5, max: 25 },
    ];
    const rh = h / 3;
    const pxPerSec = 70;
    let adv = pxPerSec * dt;
    while (adv > 0) {
      const stepPx = Math.min(1, adv);
      adv -= stepPx;
      const sdt = stepPx / pxPerSec;
      this.time += sdt;
      this.phi = (this.phi + (s.pt.hr / 60) * sdt) % 1;
      const v = this.values(s);
      const nx = this.x + stepPx;
      ctx.clearRect(nx, 0, 14, h);
      for (let i = 0; i < 3; i++) {
        const r = rows[i];
        const y = (val: number) => rh * i + rh - 4 - ((Math.min(r.max, Math.max(r.min, val)) - r.min) / (r.max - r.min)) * (rh - 8);
        if (this.last) {
          ctx.strokeStyle = r.color;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(this.x, y(this.last[i]));
          ctx.lineTo(nx, y(v[i]));
          ctx.stroke();
        }
      }
      this.last = v;
      this.x = nx;
      if (this.x >= w) { this.x = 0; this.last = null; ctx.clearRect(0, 0, 14, h); }
    }
  }
}

export interface Series { data: number[]; color: string; label: string }

/** Simple multi-series line chart with a shared y scale. */
export function drawChart(
  canvas: HTMLCanvasElement, ts: number[], series: Series[], min: number, max: number,
  marks: { t: number; color: string }[] = [],
) {
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const padL = 34, padB = 16, padT = 16;
  const t0 = ts[0] ?? 0, t1 = Math.max(t0 + 1, ts[ts.length - 1] ?? 1);
  const X = (t: number) => padL + ((t - t0) / (t1 - t0)) * (w - padL - 6);
  const Y = (v: number) => padT + (1 - (Math.min(max, Math.max(min, v)) - min) / (max - min)) * (h - padT - padB);
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = '#7d8a99';
  ctx.strokeStyle = '#1f2a36';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = min + ((max - min) * i) / 4;
    ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(w - 6, Y(v)); ctx.stroke();
    ctx.fillText(String(Math.round(v * 10) / 10), 2, Y(v) + 3);
  }
  for (const m of marks) {
    ctx.strokeStyle = m.color; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(X(m.t), padT); ctx.lineTo(X(m.t), h - padB); ctx.stroke();
    ctx.setLineDash([]);
  }
  let lx = padL;
  for (const sr of series) {
    ctx.strokeStyle = sr.color; ctx.lineWidth = 1.6;
    ctx.beginPath();
    sr.data.forEach((v, i) => { if (i === 0) ctx.moveTo(X(ts[i]), Y(v)); else ctx.lineTo(X(ts[i]), Y(v)); });
    ctx.stroke();
    ctx.fillStyle = sr.color;
    ctx.fillText(sr.label, lx, 10);
    lx += ctx.measureText(sr.label).width + 12;
  }
  ctx.fillStyle = '#7d8a99';
  ctx.fillText(Math.round((t1 - t0) / 60) + ' min', w - 44, h - 3);
}
