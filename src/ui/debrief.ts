import type { Sim } from '../sim/engine';
import { t } from '../i18n';
import { h, fmtTime } from './dom';
import { drawChart } from './waves';

export function buildDebrief(sim: Sim, onRestart: () => void): HTMLElement {
  const s = sim.s;
  const hist = s.hist;
  const onPump = hist.filter((d) => s.tm.cpbStart !== null && d.t >= s.tm.cpbStart && d.t <= (s.tm.cpbEnd ?? s.t));
  const mn = (a: number[]) => (a.length ? Math.min(...a) : NaN);
  const mx = (a: number[]) => (a.length ? Math.max(...a) : NaN);
  const f = (v: number, d = 0) => (isFinite(v) ? v.toFixed(d) : '--');
  const dur = (a: number | null, b: number | null) => (a === null ? '--:--' : fmtTime((b ?? s.t) - a));
  const score = sim.score();

  const stats: [string, string][] = [
    [t('u.elapsed'), fmtTime(s.t)],
    [t('u.cpb_time'), dur(s.tm.cpbStart, s.tm.cpbEnd)],
    [t('u.clamp_time'), dur(s.tm.clampStart, s.tm.clampEnd)],
    [t('u.map_range'), `${f(mn(onPump.map((d) => d.map)))}–${f(mx(onPump.map((d) => d.map)))} mmHg`],
    [t('u.min_svo2'), f(mn(onPump.map((d) => d.svo2))) + ' %'],
    [t('u.min_rso2'), f(mn(onPump.map((d) => d.rso2))) + ` %（base ${f(s.pt.rso2Base)}）`],
    [t('u.min_hct'), f(mn(onPump.map((d) => d.hct))) + ' %'],
    [t('u.cp_total'), `${Math.round(s.cp.total)} mL × ${s.cp.doses}`],
    [t('u.balance'), `${Math.round(s.hlm.added)} / ${Math.round(s.hlm.hemoTotal)} / ${Math.round(s.pt.urine)} mL`],
  ];

  const charts = [0, 1, 2, 3].map(() => h('canvas', { class: 'chart' }));
  const el = h('div', { class: 'overlay debrief', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'dialog wide' },
      h('h2', null, t('u.debrief')),
      h('div', { class: 'score-row' },
        h('div', { class: 'score ' + (score >= 85 ? 'good' : score >= 60 ? 'mid' : 'bad') }, h('span', null, String(score)), h('small', null, ' / 100')),
        h('div', { class: 'stats' }, ...stats.map(([k, v]) => h('div', null, h('span', { class: 'tl' }, k), h('b', null, v)))),
      ),
      h('h3', null, t('u.deductions')),
      sim.penalties.length
        ? h('ul', { class: 'pens' }, ...sim.penalties.map((p) =>
          h('li', { class: p.critical ? 'crit' : '' }, h('span', { class: 'mt' }, fmtTime(p.t)), h('span', { class: 'tx' }, t(p.key)), h('b', null, '−' + p.pts))))
        : h('p', { class: 'note' }, t('u.no_deductions')),
      h('h3', null, t('u.trend')),
      h('div', { class: 'charts' }, ...charts),
      h('p', { class: 'disclaimer' }, t('u.disclaimer')),
      h('button', { type: 'button', class: 'primary', onclick: onRestart }, t('u.restart')),
    ),
  );

  requestAnimationFrame(() => {
    const ts = hist.map((d) => d.t);
    const marks: { t: number; color: string }[] = [];
    for (const v of [s.tm.cpbStart, s.tm.cpbEnd]) if (v !== null) marks.push({ t: v, color: '#4cc9f0' });
    for (const v of [s.tm.clampStart, s.tm.clampEnd]) if (v !== null) marks.push({ t: v, color: '#ffd166' });
    if (ts.length < 2) return;
    drawChart(charts[0], ts, [
      { data: hist.map((d) => d.map), color: '#ff5252', label: 'MAP mmHg' },
      { data: hist.map((d) => d.flow * 10), color: '#37e06c', label: `${t('u.flow')} ×10 L/min` },
      { data: hist.map((d) => d.cvp), color: '#4cc9f0', label: 'CVP' },
    ], 0, 120, marks);
    drawChart(charts[1], ts, [
      { data: hist.map((d) => d.tNP), color: '#ffd166', label: t('u.np') },
      { data: hist.map((d) => d.tBl), color: '#ff9f6b', label: t('u.bladder') },
    ], 30, 38, marks);
    drawChart(charts[2], ts, [
      { data: hist.map((d) => d.svo2), color: '#7ee0ff', label: 'SvO₂ %' },
      { data: hist.map((d) => d.rso2), color: '#f4d35e', label: 'rSO₂ %' },
      { data: hist.map((d) => d.hct), color: '#ff7aa8', label: 'Hct %' },
    ], 10, 100, marks);
    drawChart(charts[3], ts, [
      { data: hist.map((d) => d.res), color: '#c58af9', label: `${t('u.reservoir')} mL` },
    ], 0, 3000, marks);
  });
  return el;
}
