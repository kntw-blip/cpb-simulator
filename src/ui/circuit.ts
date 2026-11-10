import type { State } from '../sim/model';
import { sv } from './dom';
import { t } from '../i18n';

const RES_MAX = 3000;

/** Schematic of the bypass circuit. Clamps are clickable. */
export function buildCircuit(s: State, onChange: () => void) {
  const label = (x: number, y: number, text: string, extra: Record<string, any> = {}) =>
    sv('text', { x, y, fill: '#9fb0c2', 'font-size': 11, ...extra, text });

  const venLine = sv('path', { d: 'M62,78 V100 H215 V112', class: 'line ven' });
  const venFlow = sv('path', { d: 'M62,78 V100 H215 V112', class: 'line-flow' });
  const artLine = sv('path', { d: 'M215,206 V222 H318 M362,222 H425 V186 M425,112 V40 H112', class: 'line art' });
  const artFlow = sv('path', { d: 'M215,206 V222 H318 M362,222 H425 V186 M425,112 V40 H112', class: 'line-flow' });

  const resLevel = sv('rect', { x: 181, y: 205, width: 68, height: 0, fill: '#8f1d2c' });
  const resText = sv('text', { x: 215, y: 130, fill: '#fff', 'font-size': 13, 'font-weight': 700, 'text-anchor': 'middle' });
  const rotor = sv('g', null,
    sv('line', { x1: 325, y1: 222, x2: 355, y2: 222, stroke: '#cfd8e3', 'stroke-width': 3 }),
    sv('line', { x1: 340, y1: 207, x2: 340, y2: 237, stroke: '#cfd8e3', 'stroke-width': 3 }));
  const flowText = sv('text', { x: 340, y: 262, fill: '#fff', 'font-size': 13, 'font-weight': 700, 'text-anchor': 'middle' });

  const mkClamp = (x: number, y: number, vertical: boolean) => {
    const bar = sv('rect', vertical
      ? { x: x - 13, y: y - 3, width: 26, height: 6, rx: 2 }
      : { x: x - 3, y: y - 13, width: 6, height: 26, rx: 2 });
    const hit = sv('rect', { x: x - 20, y: y - 20, width: 40, height: 40, fill: 'transparent', class: 'hit' });
    const g = sv('g', { class: 'clamp', role: 'button', tabindex: 0 }, bar, hit);
    return { g, bar };
  };
  const artC = mkClamp(260, 40, false);
  const artCText = label(260, 22, '', { 'text-anchor': 'middle' });
  const toggleArt = () => { if (s.surg.artCannula) { s.hlm.artOpen = !s.hlm.artOpen; onChange(); } };
  artC.g.addEventListener('click', toggleArt);
  artC.g.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') { e.preventDefault(); toggleArt(); } });
  const venC = mkClamp(138, 100, false);
  const venCText = label(138, 82, '', { 'text-anchor': 'middle' });

  const small = (x: number, y: number, name: string) => {
    const c = sv('circle', { cx: x, cy: y, r: 11, fill: '#18212b', stroke: '#4b5a6b', 'stroke-width': 2 });
    const tx = sv('text', { x, y: y + 28, fill: '#fff', 'font-size': 11, 'text-anchor': 'middle' });
    return { c, tx, g: sv('g', null, c, label(x, y - 16, name, { 'text-anchor': 'middle', 'font-size': 10 }), tx) };
  };
  const suc = small(40, 150, t('u.suction'));
  const vent = small(100, 150, t('u.vent'));
  const cpP = small(486, 96, t('u.cp'));
  const gasText = sv('text', { x: 458, y: 168, fill: '#9fe8c9', 'font-size': 11 });
  const tempText = sv('text', { x: 458, y: 184, fill: '#ffd166', 'font-size': 11 });

  const el = sv('svg', { viewBox: '0 0 580 272', class: 'circuit-svg', role: 'img' },
    // patient
    sv('rect', { x: 12, y: 12, width: 100, height: 66, rx: 10, fill: '#18212b', stroke: '#4b5a6b', 'stroke-width': 2 }),
    label(62, 50, t('u.patient'), { 'text-anchor': 'middle', 'font-size': 13, fill: '#fff' }),
    venLine, venFlow, artLine, artFlow,
    sv('path', { d: 'M40,78 V139 M100,78 V139 M51,150 H89 M100,161 V176 H181', class: 'line thin' }),
    sv('path', { d: 'M450,130 H486 V107 M486,85 V26 H112', class: 'line thin' }),
    // reservoir
    sv('rect', { x: 180, y: 112, width: 70, height: 94, rx: 4, fill: '#0c1218', stroke: '#6b7b8d', 'stroke-width': 2 }),
    resLevel,
    sv('rect', { x: 180, y: 112, width: 70, height: 94, rx: 4, fill: 'none', stroke: '#6b7b8d', 'stroke-width': 2 }),
    resText,
    label(256, 160, t('u.reservoir'), { 'font-size': 10 }),
    // pump
    sv('circle', { cx: 340, cy: 222, r: 22, fill: '#18212b', stroke: '#6b7b8d', 'stroke-width': 2 }),
    rotor, flowText,
    label(340, 192, s.cfg.pumpType === 'roller' ? t('u.roller') : t('u.centrifugal'), { 'text-anchor': 'middle', 'font-size': 10 }),
    // oxygenator
    sv('rect', { x: 400, y: 112, width: 50, height: 74, rx: 6, fill: '#18212b', stroke: '#6b7b8d', 'stroke-width': 2 }),
    label(425, 146, 'OXY', { 'text-anchor': 'middle', fill: '#fff' }),
    label(425, 160, 'HX', { 'text-anchor': 'middle', 'font-size': 10 }),
    gasText, tempText,
    suc.g, vent.g, cpP.g,
    artC.g, artCText, venC.g, venCText,
  );

  let off = 0, offV = 0, ang = 0;
  return {
    el,
    update(dt: number) {
      const hl = s.hlm;
      const lvl = Math.min(1, hl.resVol / RES_MAX) * 92;
      resLevel.setAttribute('y', String(205 - lvl));
      resLevel.setAttribute('height', String(lvl));
      resLevel.setAttribute('fill', hl.resVol < 200 ? '#ff3b3b' : hl.resVol < 400 ? '#d98a1a' : '#8f1d2c');
      resText.textContent = Math.round(hl.resVol) + ' mL';
      flowText.textContent = hl.flow.toFixed(2) + ' L/min';
      off -= hl.flow * 22 * dt; offV -= hl.venFlow * 22 * dt;
      artFlow.style.strokeDashoffset = String(off);
      artFlow.style.opacity = Math.abs(hl.flow) > 0.05 ? '1' : '0';
      venFlow.style.strokeDashoffset = String(offV);
      venFlow.style.opacity = hl.venFlow > 0.05 ? '1' : '0';
      const spin = s.cfg.pumpType === 'roller' ? hl.rpm * 6 : hl.rpm * 0.4;
      ang = (ang + spin * dt) % 360;
      rotor.setAttribute('transform', `rotate(${ang.toFixed(1)} 340 222)`);
      artC.bar.setAttribute('fill', hl.artOpen ? '#37e06c' : '#ff5252');
      artC.bar.setAttribute('transform', hl.artOpen ? 'rotate(90 260 40)' : '');
      artCText.textContent = `${t('u.art_clamp')}: ${hl.artOpen ? t('u.open') : t('u.closed')}`;
      artC.g.setAttribute('aria-label', artCText.textContent);
      artC.g.classList.toggle('disabled', !s.surg.artCannula);
      const vo = hl.venOcc;
      venC.bar.setAttribute('fill', vo > 0.02 ? (vo > 0.98 ? '#37e06c' : '#ffb020') : '#ff5252');
      venCText.textContent = `${t('u.ven')}: ${Math.round(vo * 100)}%`;
      suc.c.setAttribute('stroke', hl.suction > 0 ? '#37e06c' : '#4b5a6b'); suc.tx.textContent = String(Math.round(hl.suction));
      vent.c.setAttribute('stroke', hl.vent > 0 ? '#37e06c' : '#4b5a6b'); vent.tx.textContent = String(Math.round(hl.vent));
      cpP.c.setAttribute('stroke', s.cp.flow > 0 ? '#37e06c' : '#4b5a6b'); cpP.tx.textContent = String(Math.round(s.cp.flow));
      gasText.textContent = `FiO₂ ${hl.fio2.toFixed(2)} / ${hl.sweep.toFixed(1)} L`;
      tempText.textContent = `${hl.tArt.toFixed(1)} °C`;
    },
  };
}
