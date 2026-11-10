import type { State } from '../sim/model';
import { sv } from './dom';
import { t } from '../i18n';

/** Schematic surgical-field view: heart state, cannulae, clamp, grafts, blood in the field. */
export function buildField() {
  const pool = sv('rect', { x: 30, y: 190, width: 260, height: 0, fill: '#b3161f', opacity: 0.85, 'clip-path': 'url(#fieldClip)' });
  const heart = sv('path', {
    d: 'M160,82 C186,60 228,82 216,122 C208,151 176,166 160,174 C140,162 110,146 107,116 C104,86 140,66 160,82Z',
    fill: '#b23a3a', stroke: '#5c1717', 'stroke-width': 2,
  });
  const coronaries = sv('path', {
    d: 'M160,84 C158,110 166,140 160,170 M160,90 C180,96 198,104 208,124 M158,92 C140,98 124,108 114,124',
    fill: 'none', stroke: '#e9a23b', 'stroke-width': 1.6, opacity: 0.7,
  });
  const grafts = [
    sv('path', { d: 'M168,44 C110,50 96,100 118,128', fill: 'none', stroke: '#6fa8dc', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    sv('path', { d: 'M176,44 C240,52 236,100 206,126', fill: 'none', stroke: '#6fa8dc', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    sv('path', { d: 'M100,22 C120,60 150,90 161,140', fill: 'none', stroke: '#f4d35e', 'stroke-width': 3.5, 'stroke-linecap': 'round' }),
  ];
  const heartG = sv('g', null, heart, coronaries);
  const artCan = sv('g', null,
    sv('path', { d: 'M300,14 C250,16 215,24 190,36', fill: 'none', stroke: '#ff5252', 'stroke-width': 6, 'stroke-linecap': 'round' }));
  const venCan = sv('g', null,
    sv('path', { d: 'M20,170 C60,160 96,140 118,112', fill: 'none', stroke: '#3d7dd8', 'stroke-width': 8, 'stroke-linecap': 'round' }));
  const ventLine = sv('path', { d: 'M300,60 C250,62 210,58 176,62', fill: 'none', stroke: '#c58af9', 'stroke-width': 3, 'stroke-linecap': 'round' });
  const clamp = sv('g', null,
    sv('rect', { x: 132, y: 44, width: 78, height: 7, rx: 3, fill: '#d9dee5', stroke: '#6b7280' }),
    sv('rect', { x: 206, y: 36, width: 46, height: 6, rx: 3, fill: '#d9dee5', stroke: '#6b7280', transform: 'rotate(-18 206 39)' }));
  const clampLabel = sv('text', { x: 20, y: 28, fill: '#ffd166', 'font-size': 13, 'font-weight': 700 });
  const el = sv('svg', { viewBox: '0 0 320 200', class: 'field-svg', role: 'img' },
    sv('defs', null, sv('clipPath', { id: 'fieldClip' }, sv('ellipse', { cx: 160, cy: 104, rx: 132, ry: 88 }))),
    sv('rect', { x: 0, y: 0, width: 320, height: 200, fill: '#0e4a48' }),
    sv('ellipse', { cx: 160, cy: 104, rx: 132, ry: 88, fill: '#3a0e14', stroke: '#c9d1d9', 'stroke-width': 3 }),
    pool,
    sv('path', { d: 'M160,84 C160,58 172,44 196,30', fill: 'none', stroke: '#c9584f', 'stroke-width': 20, 'stroke-linecap': 'round' }),
    heartG, ...grafts, venCan, artCan, ventLine, clamp, clampLabel,
  );

  let time = 0;
  let phi = 0;
  return {
    el,
    update(s: State, dt: number, graftCount: number) {
      const p = s.pt, g = s.surg;
      time += dt;
      phi = (phi + (p.hr / 60) * dt) % 1;
      let scale = 1 + 0.12 * p.lvDist;
      let jx = 0;
      if (p.hr > 0) scale *= 1 - 0.06 * Math.max(0, Math.sin(phi * 2 * Math.PI)) * (g.xclamp ? 0.4 : 1);
      else if (p.rhythm === 'vf') { jx = Math.sin(time * 40) * 0.8; scale *= 1 + 0.01 * Math.sin(time * 53); }
      const rot = g.heartLifted ? -24 : 0;
      const ty = g.heartLifted ? -10 : 0;
      heartG.setAttribute('transform', `translate(${jx} ${ty}) rotate(${rot} 160 120) translate(160 120) scale(${scale.toFixed(3)}) translate(-160 -120)`);
      heart.setAttribute('fill', p.rhythm === 'asystole' ? '#8a5560' : p.lvDist > 0.6 ? '#c9463f' : '#b23a3a');
      grafts.forEach((gr, i) => { gr.style.display = i < graftCount ? '' : 'none'; });
      artCan.style.display = g.artCannula ? '' : 'none';
      venCan.style.display = g.venCannula ? '' : 'none';
      ventLine.style.display = g.ventPlaced ? '' : 'none';
      clamp.style.display = g.xclamp ? '' : 'none';
      clampLabel.textContent = g.xclamp ? t('u.xclamp') : '';
      const hgt = Math.min(120, (g.pool / 800) * 120);
      pool.setAttribute('y', String(192 - hgt));
      pool.setAttribute('height', String(hgt));
    },
  };
}
