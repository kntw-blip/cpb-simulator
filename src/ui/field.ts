import { State, onCpb } from '../sim/model';
import { sv } from './dom';
import { t } from '../i18n';

const WELL = 'M136,26 H264 C292,26 312,46 312,74 V206 C312,234 292,254 264,254 H136 C108,254 88,234 88,206 V74 C88,46 108,26 136,26Z';
const VENT = 'M158,112 C176,100 226,100 250,120 C276,142 282,182 262,214 C246,238 222,250 206,246 C176,238 150,206 150,170 C150,146 150,126 158,112Z';

/** A vessel or tube drawn as outline + body + highlight. */
function tube(d: string, width: number, body: string, edge: string, shine = 0.3) {
  return sv('g', null,
    sv('path', { d, fill: 'none', stroke: edge, 'stroke-width': width + 3, 'stroke-linecap': 'round' }),
    sv('path', { d, fill: 'none', stroke: body, 'stroke-width': width, 'stroke-linecap': 'round' }),
    sv('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': Math.max(1, width * 0.18), 'stroke-linecap': 'round', opacity: shine, transform: 'translate(-1.5 -1.5)' }),
  );
}

/** Illustrated surgical-field camera view (median sternotomy, head at the top). */
export function buildField() {
  const grad = (id: string, stops: [number, string, number?][], attrs: Record<string, any> = {}, type = 'radialGradient') =>
    sv(type, { id, ...attrs }, ...stops.map(([o, c, a]) => sv('stop', { offset: o, 'stop-color': c, 'stop-opacity': a ?? 1 })));

  const defs = sv('defs', null,
    sv('clipPath', { id: 'fWell' }, sv('path', { d: WELL })),
    grad('fHeart', [[0, '#e0766a'], [0.45, '#b23a36'], [1, '#6e1a1f']], { cx: '38%', cy: '32%', r: '75%' }),
    grad('fRA', [[0, '#a0485a'], [1, '#5a1f30']], { cx: '40%', cy: '30%', r: '75%' }),
    grad('fWellBg', [[0, '#5a1820'], [0.7, '#35090f'], [1, '#1c0407']], { cx: '50%', cy: '45%', r: '65%' }),
    grad('fDrape', [[0, '#2c8a93'], [1, '#15525a']], { cx: '50%', cy: '45%', r: '75%' }),
    grad('fVig', [[0.45, '#000', 0], [1, '#000', 0.6]], { cx: '50%', cy: '48%', r: '72%' }),
    grad('fMetal', [[0, '#f7f9fb'], [0.5, '#aab3be'], [1, '#e3e8ee']], { x1: 0, y1: 0, x2: 1, y2: 1 }, 'linearGradient'),
    grad('fBlood', [[0, '#b01722'], [1, '#5c070d']], { x1: 0, y1: 0, x2: 0, y2: 1 }, 'linearGradient'),
    sv('filter', { id: 'fShadow', x: '-20%', y: '-20%', width: '140%', height: '140%' },
      sv('feDropShadow', { dx: 2, dy: 4, stdDeviation: 4, 'flood-color': '#000', 'flood-opacity': 0.55 })),
    sv('filter', { id: 'fSoft' }, sv('feGaussianBlur', { stdDeviation: 3 })),
  );

  // --- drapes, sternum, pericardium ---
  const drape = sv('g', null,
    sv('rect', { x: 0, y: 0, width: 400, height: 280, fill: 'url(#fDrape)' }),
    sv('path', { d: 'M0,60 C60,80 70,150 30,280 M400,40 C350,90 340,170 372,280 M40,0 C80,20 100,24 140,10 M260,270 C300,262 340,266 400,250', fill: 'none', stroke: '#0d3f46', 'stroke-width': 3, opacity: 0.5 }),
  );
  const well = sv('g', null,
    sv('path', { d: WELL, fill: 'url(#fWellBg)' }),
    // pericardial edges pulled up by stay sutures
    sv('path', { d: WELL, fill: 'none', stroke: '#c9727a', 'stroke-width': 14, opacity: 0.55, 'clip-path': 'url(#fWell)' }),
    sv('path', { d: 'M96,60 L70,48 M96,200 L68,214 M304,60 L330,48 M304,200 L332,214 M150,30 L146,8 M250,30 L254,8', stroke: '#1b2a4a', 'stroke-width': 1.2 }),
  );
  const sternum = sv('g', null,
    sv('path', { d: WELL, fill: 'none', stroke: '#ead9b8', 'stroke-width': 7 }),
    sv('path', { d: WELL, fill: 'none', stroke: '#8d2a2a', 'stroke-width': 2, 'stroke-dasharray': '2 5', opacity: 0.8 }),
  );
  const retractor = sv('g', { filter: 'url(#fShadow)' },
    sv('rect', { x: 66, y: 78, width: 24, height: 124, rx: 6, fill: 'url(#fMetal)', stroke: '#5d6772' }),
    sv('rect', { x: 310, y: 78, width: 24, height: 124, rx: 6, fill: 'url(#fMetal)', stroke: '#5d6772' }),
    sv('path', { d: 'M78,202 V262 M322,202 V262', stroke: '#c5ccd5', 'stroke-width': 9 }),
    sv('rect', { x: 52, y: 258, width: 296, height: 12, rx: 3, fill: 'url(#fMetal)', stroke: '#5d6772' }),
    sv('path', { d: 'M96,264 H300', stroke: '#5d6772', 'stroke-width': 4, 'stroke-dasharray': '2 4' }),
    sv('circle', { cx: 322, cy: 264, r: 9, fill: '#cfd6de', stroke: '#5d6772' }),
  );

  // --- great vessels (static) ---
  const svc = tube('M150,98 C147,72 150,52 152,30', 20, '#6a3350', '#3d1a2c', 0.18);
  const pa = tube('M224,124 C234,102 250,86 268,64', 28, '#d7b9c1', '#8a6b74', 0.3);
  const aorta = tube('M198,120 C196,92 186,66 180,32', 32, '#ecc7b8', '#9a6b60', 0.35);
  const aortaVasa = sv('path', { d: 'M190,110 C186,90 184,70 176,44 M204,100 C200,84 196,70 192,56', fill: 'none', stroke: '#c0463e', 'stroke-width': 0.9, opacity: 0.6 });

  // --- heart (animated group) ---
  const ventFill = sv('path', { d: VENT, fill: 'url(#fHeart)', stroke: '#4d1014', 'stroke-width': 1.5 });
  const cold = sv('path', { d: VENT, fill: '#6c7fa6', opacity: 0 });
  const gloss = sv('ellipse', { cx: 192, cy: 150, rx: 20, ry: 40, fill: '#fff', opacity: 0.14, transform: 'rotate(-18 192 150)', filter: 'url(#fSoft)' });
  const heartG = sv('g', { filter: 'url(#fShadow)' },
    sv('path', { d: 'M150,92 C128,96 114,120 120,150 C124,172 142,184 160,180 C172,150 170,110 150,92Z', fill: 'url(#fRA)', stroke: '#3d1220', 'stroke-width': 1.2 }),
    ventFill, cold,
    // right atrial appendage
    sv('path', { d: 'M158,102 C168,90 188,96 186,112 C182,124 164,124 157,114Z', fill: '#8f3a4a', stroke: '#4a1524', 'stroke-width': 1 }),
    // epicardial fat in the grooves
    sv('path', { d: 'M162,116 C151,136 149,162 158,188', fill: 'none', stroke: '#e6c768', 'stroke-width': 9, 'stroke-linecap': 'round', opacity: 0.92 }),
    sv('path', { d: 'M228,112 C235,150 229,200 212,240', fill: 'none', stroke: '#e6c768', 'stroke-width': 10, 'stroke-linecap': 'round', opacity: 0.9 }),
    sv('path', { d: 'M170,108 C196,100 222,104 244,116', fill: 'none', stroke: '#e6c768', 'stroke-width': 7, 'stroke-linecap': 'round', opacity: 0.75 }),
    // coronary arteries (RCA, LAD, diagonals) and veins
    sv('path', { d: 'M164,114 C153,136 151,162 159,188 C164,200 172,210 182,218', fill: 'none', stroke: '#a81b17', 'stroke-width': 2.3, 'stroke-linecap': 'round' }),
    sv('path', { d: 'M226,110 C234,150 228,198 212,240 M231,140 C246,150 256,164 262,182 M230,170 C242,182 248,196 250,210', fill: 'none', stroke: '#a81b17', 'stroke-width': 2.3, 'stroke-linecap': 'round' }),
    sv('path', { d: 'M222,118 C226,156 222,200 206,238 M176,140 C190,160 196,190 190,224', fill: 'none', stroke: '#47356e', 'stroke-width': 1.4, opacity: 0.7 }),
    gloss,
  );

  // --- grafts ---
  const vein = (d: string) => tube(d, 6, '#c79aa0', '#6f4a55', 0.4);
  const lita = sv('g', null,
    sv('path', { d: 'M318,52 C294,100 254,140 224,178', fill: 'none', stroke: '#d9b65a', 'stroke-width': 9, 'stroke-linecap': 'round', opacity: 0.95 }),
    sv('path', { d: 'M318,52 C294,100 254,140 224,178', fill: 'none', stroke: '#b3261e', 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
  const grafts = [vein('M184,88 C118,86 108,160 156,198'), vein('M202,86 C292,82 304,168 266,196'), lita];

  // --- cannulae and clamp ---
  const artCan = sv('g', { filter: 'url(#fShadow)' },
    sv('path', { d: 'M183,52 C198,36 256,20 400,12', fill: 'none', stroke: '#e8eef4', 'stroke-width': 12, 'stroke-linecap': 'round', opacity: 0.55 }),
    sv('path', { d: 'M183,52 C198,36 256,20 400,12', fill: 'none', stroke: '#d81f2a', 'stroke-width': 7.5, 'stroke-linecap': 'round' }),
    sv('ellipse', { cx: 183, cy: 53, rx: 9, ry: 6, fill: 'none', stroke: '#2a4fb0', 'stroke-width': 1.6 }),
    sv('path', { d: 'M176,56 L150,40', stroke: '#c7372f', 'stroke-width': 4, 'stroke-linecap': 'round' }));
  const venCan = sv('g', { filter: 'url(#fShadow)' },
    sv('path', { d: 'M168,110 C142,142 92,204 0,238', fill: 'none', stroke: '#e8eef4', 'stroke-width': 18, 'stroke-linecap': 'round', opacity: 0.5 }),
    sv('path', { d: 'M168,110 C142,142 92,204 0,238', fill: 'none', stroke: '#74101d', 'stroke-width': 12.5, 'stroke-linecap': 'round' }),
    sv('path', { d: 'M168,110 C142,142 92,204 0,238', fill: 'none', stroke: '#fff', 'stroke-width': 12, 'stroke-dasharray': '1.2 5', opacity: 0.18 }),
    sv('ellipse', { cx: 168, cy: 110, rx: 10, ry: 7, fill: 'none', stroke: '#2a4fb0', 'stroke-width': 1.6 }));
  const rootLine = sv('g', null,
    sv('path', { d: 'M194,94 C232,82 300,100 400,116', fill: 'none', stroke: '#e8eef4', 'stroke-width': 5, 'stroke-linecap': 'round', opacity: 0.6 }),
    sv('path', { d: 'M194,94 C232,82 300,100 400,116', fill: 'none', stroke: '#c9404a', 'stroke-width': 2.4, 'stroke-linecap': 'round' }),
    sv('circle', { cx: 194, cy: 94, r: 4, fill: '#dfe6ee', stroke: '#5d6772' }));
  const clamp = sv('g', { filter: 'url(#fShadow)', transform: 'rotate(8 190 72)' },
    sv('rect', { x: 150, y: 67, width: 96, height: 4.5, rx: 2, fill: 'url(#fMetal)', stroke: '#4d5661', 'stroke-width': 0.8 }),
    sv('rect', { x: 150, y: 74, width: 96, height: 4.5, rx: 2, fill: 'url(#fMetal)', stroke: '#4d5661', 'stroke-width': 0.8 }),
    sv('path', { d: 'M246,69 L330,60 M246,76 L330,88', stroke: 'url(#fMetal)', 'stroke-width': 5, 'stroke-linecap': 'round' }),
    sv('circle', { cx: 250, cy: 73, r: 4, fill: '#8b95a1' }),
    sv('circle', { cx: 340, cy: 58, r: 9, fill: 'none', stroke: '#c5ccd5', 'stroke-width': 4 }),
    sv('circle', { cx: 340, cy: 91, r: 9, fill: 'none', stroke: '#c5ccd5', 'stroke-width': 4 }));

  // --- surgeon's instruments at the anastomosis ---
  const needle = sv('g', null,
    sv('path', { d: 'M-70,74 L-4,4 M-76,66 L-8,6', stroke: 'url(#fMetal)', 'stroke-width': 3, 'stroke-linecap': 'round' }),
    sv('path', { d: 'M96,70 L10,6', stroke: 'url(#fMetal)', 'stroke-width': 5.5, 'stroke-linecap': 'round' }),
    sv('path', { d: 'M10,6 L2,1', stroke: '#7d8792', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    sv('path', { d: 'M-5,2 A7,7 0 0 1 8,2', fill: 'none', stroke: '#f2f5f8', 'stroke-width': 1.4 }),
    sv('path', { d: 'M8,2 C30,-20 50,-34 86,-40', fill: 'none', stroke: '#3a67d6', 'stroke-width': 0.9 }));
  const instruments = sv('g', { filter: 'url(#fShadow)' }, needle);

  // --- blood, gauze, suction ---
  const pool = sv('path', { d: '', fill: 'url(#fBlood)', opacity: 0.93, 'clip-path': 'url(#fWell)' });
  const poolShine = sv('path', { d: '', fill: 'none', stroke: '#ff9aa0', 'stroke-width': 1.5, opacity: 0.45, 'clip-path': 'url(#fWell)' });
  const gauze = sv('g', null,
    sv('path', { d: 'M196,226 C216,212 262,212 286,224 C296,236 286,250 262,252 C232,254 204,250 196,240Z', fill: '#eef1f2', stroke: '#b9c0c6' }),
    sv('path', { d: 'M206,232 H282 M204,240 H284 M222,220 V250 M246,216 V252 M270,220 V250', stroke: '#c9d0d5', 'stroke-width': 0.8 }),
    sv('path', { d: 'M200,236 C214,230 222,244 236,246 C226,252 208,250 200,244Z', fill: '#c0303a', opacity: 0.55 }));
  const sucker = sv('g', { filter: 'url(#fShadow)' },
    sv('path', { d: 'M400,262 L296,238', stroke: 'url(#fMetal)', 'stroke-width': 6, 'stroke-linecap': 'round' }),
    sv('path', { d: 'M296,238 L286,236', stroke: '#6b7480', 'stroke-width': 7, 'stroke-linecap': 'round' }));

  const label = sv('text', { x: 14, y: 40, fill: '#ffd166', 'font-size': 14, 'font-weight': 700 });
  const cam = sv('g', null,
    sv('circle', { cx: 16, cy: 16, r: 4, fill: '#ff4040' }),
    sv('text', { x: 26, y: 20, fill: '#fff', 'font-size': 11, opacity: 0.85, text: 'CAM 1' }));

  const el = sv('svg', { viewBox: '0 0 400 280', class: 'field-svg', role: 'img', 'aria-label': t('u.field') },
    defs, drape, well, svc, pa, aorta, aortaVasa, gauze, heartG, pool, poolShine,
    ...grafts, venCan, rootLine, clamp, artCan, instruments, sternum, retractor, sucker,
    sv('rect', { x: 0, y: 0, width: 400, height: 280, fill: 'url(#fVig)', 'pointer-events': 'none' }),
    cam, label,
  );

  const targets: Record<string, [number, number]> = {
    's.distal1': [156, 198], 's.distal2': [266, 196], 's.distal3': [224, 178], 's.proximal': [192, 86],
  };
  let time = 0, phi = 0, fill = 1, lift = 0;
  const show = (e: SVGElement, on: boolean) => { e.style.display = on ? '' : 'none'; };

  return {
    el,
    update(s: State, dt: number, graftCount: number) {
      const p = s.pt, g = s.surg;
      time += dt;
      phi = (phi + (p.hr / 60) * dt) % 1;

      // heart size follows filling: full pre-bypass, decompressed on bypass, tense when distended
      const fillT = onCpb(s) ? Math.min(1, Math.max(0, p.cvp / 7)) : 1;
      fill += (fillT - fill) * Math.min(1, dt * 1.5);
      lift += ((g.heartLifted ? 1 : 0) - lift) * Math.min(1, dt * 2);
      let scale = 0.86 + 0.14 * fill + 0.13 * p.lvDist;
      let rot = -22 * lift, jx = 0, jy = -16 * lift;
      if (p.hr > 0) {
        const sys = Math.max(0, Math.sin(phi * 2 * Math.PI)) ** 2;
        scale *= 1 - (0.035 + 0.05 * fill) * sys;
        rot += 2.2 * sys;
      } else if (p.rhythm === 'vf') {
        jx = Math.sin(time * 41) * 0.7; jy += Math.cos(time * 37) * 0.6;
        scale *= 1 + 0.008 * Math.sin(time * 53);
      }
      heartG.setAttribute('transform',
        `translate(${jx.toFixed(2)} ${jy.toFixed(2)}) rotate(${rot.toFixed(2)} 200 116) translate(200 116) scale(${scale.toFixed(3)}) translate(-200 -116)`);
      const coldT = p.rhythm === 'asystole' ? 0.38 : 0;
      cold.setAttribute('opacity', (+cold.getAttribute('opacity')! + (coldT - +cold.getAttribute('opacity')!) * Math.min(1, dt)).toFixed(3));
      gloss.setAttribute('opacity', (0.12 + 0.2 * p.lvDist).toFixed(2));

      grafts.forEach((gr, i) => show(gr, i < graftCount));
      show(artCan, g.artCannula);
      show(venCan, g.venCannula);
      show(rootLine, g.ventPlaced || g.xclamp);
      show(clamp, g.xclamp);
      show(gauze, lift > 0.3);
      show(sucker, s.hlm.suction > 0);
      label.textContent = g.xclamp ? t('u.xclamp') : '';

      const tg = targets[g.step];
      show(instruments, !!tg);
      if (tg) {
        const dx = Math.sin(time * 1.7) * 3 + Math.sin(time * 4.3) * 1.2;
        const dy = Math.cos(time * 2.1) * 2.5;
        needle.setAttribute('transform', `translate(${(tg[0] + dx).toFixed(1)} ${(tg[1] + dy).toFixed(1)}) rotate(${(Math.sin(time * 1.3) * 5).toFixed(1)})`);
      }

      // blood collecting at the bottom of the pericardial well
      const depth = 6 + Math.min(120, (g.pool / 700) * 120);
      const y = 254 - depth;
      const w = Math.sin(time * 1.6) * 1.5;
      const top = `M80,${(y + w).toFixed(1)} C140,${(y - 3 - w).toFixed(1)} 200,${(y + 3 + w).toFixed(1)} 260,${(y - w).toFixed(1)} S310,${(y + 2).toFixed(1)} 320,${y.toFixed(1)}`;
      pool.setAttribute('d', `${top} V260 H80Z`);
      poolShine.setAttribute('d', top);
    },
  };
}
