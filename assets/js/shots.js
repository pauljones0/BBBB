/* The fifth view: shots.
   Cumulative fixes against cumulative cost, one trajectory per run, one point
   per shot — the answer to "what did shots 2-5 buy, and what did the cache pay
   for". Same visual language as the two maps (log cost axis, run-colour marks,
   greedy labels, tooltip on hover/focus), extended in three small ways:

     line      one run's shots in order, in the run's own colour
     grey stub the cached dollars behind each point: from x(cost minus cache)
               to the point itself, flat neutral grey — never the run's colour,
               because cache share is not the score
     diamond   a pipeline handoff: the first shot of a new phase, where the
               cheap model hands the run to the smart one. Shape, not colour,
               carries the state.

   Shot numerals ride beside their points; the tooltip carries the exact figures
   (new this shot, cumulative cost, cache share, repo split, declared-done).
   Layout is pure (shotsLayout) so the on-screen SVG and the PNG export cannot
   drift apart. */

import {
  pointLabels, fmtCost, trimNum, svgEl, el, measureText,
} from './format.js?v=1ff76947fb';
import { runColor } from './theme.js?v=1ff76947fb';

const LABEL_FONT = '10.5px Inter, system-ui, sans-serif';
const NUM_FONT = '9px Inter, system-ui, sans-serif';
const LOG_TICKS = [0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
const CEILING = 105;

export const SHOTS_META = {
  slug: 'shots',
  chartTitle: 'Score against cost, by shot',
  corner: 'cheap and strong',
  title: 'Cumulative run cost, USD — logarithmic, cheaper to the left',
  titleCompact: 'Cum. cost, USD (log)',
  exportTitle: 'CUMULATIVE RUN COST, USD — LOGARITHMIC, CHEAPER TO THE LEFT',
};

/* The maps' own candidate offsets, reused so a shots label sits where a map
   label would. Shot numerals get a single offset below, tried after every
   endpoint label has had its pick. */
const CANDIDATES = [
  [11, 4, 'start'], [-11, 4, 'end'],
  [0, -11, 'middle'], [0, 16, 'middle'],
  [9, -8, 'start'], [-9, -8, 'end'],
  [9, 15, 'start'], [-9, 15, 'end'],
  [16, 4, 'start'], [-16, 4, 'end'],
];
const NUM_OFFSET = [11, -11, 'start'];

function overlaps(a, b) {
  return !(a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0);
}

/** Series for the runs on screen, plus — in demo mode only — the synthetic
    pipeline series, which never touch the picker, the table or any other view.
    Returns the drawable series and the selected runs that carry no shot data,
    so the view can say which it skipped instead of silently dropping them. */
export function buildSeries(selectedRuns, synthetic, demoOn) {
  const series = [];
  const withoutShots = [];
  selectedRuns.forEach((r) => {
    const shots = Array.isArray(r.shots) ? r.shots.slice().sort((a, b) => a.shot - b.shot) : [];
    if (shots.length) series.push({ run: r, shots, demo: false });
    else withoutShots.push(r);
  });
  if (demoOn && Array.isArray(synthetic)) {
    synthetic.forEach((s) => {
      const shots = Array.isArray(s.shots) ? s.shots.slice().sort((a, b) => a.shot - b.shot) : [];
      if (shots.length) series.push({ run: s.run, shots, demo: true });
    });
  }
  return { series, withoutShots };
}

/** "(Model A → Model B)" for a pipeline arm's legend line, or '' for a
    single-model run. One place, because the page and the PNG export must
    name the same run the same way. */
export function pipelineSuffix(run) {
  const phases = run.pipeline && run.pipeline.phases;
  if (!Array.isArray(phases) || phases.length < 2) return '';
  return ` (${phases.map((p) => p.model).join(' → ')})`;
}

export function shotsLayout(series, domainShots, bestFixed, width, height) {
  const compact = width < 620;
  const m = {
    top: 38,
    right: compact ? 16 : 26,
    bottom: compact ? 52 : 58,
    left: compact ? 38 : 52,
  };
  const plotW = Math.max(60, width - m.left - m.right);
  const plotH = Math.max(60, height - m.top - m.bottom);

  /* The x domain comes from every shot row available, not just the selection —
     the maps' rule that rescaling must not follow filtering, applied to shots. */
  const costs = (domainShots || [])
    .map((s) => s.cum_cost_usd)
    .filter((c) => c !== null && c !== undefined && c > 0);
  const lo = costs.length ? Math.min(...costs) / 1.7 : 0.5;
  const hi = costs.length ? Math.max(...costs) * 1.7 : 100;
  const l0 = Math.log10(lo);
  const l1 = Math.log10(hi);
  const x = (c) => m.left + ((Math.log10(Math.max(c, lo)) - l0) / (l1 - l0)) * plotW;
  let xTicks = LOG_TICKS.filter((t) => t >= lo && t <= hi).map((t) => ({
    v: t, x: x(t), label: t < 1 ? `$${t.toFixed(2).replace(/0$/, '')}` : `$${t}`,
  }));
  // on a phone, half the ticks is still a readable log axis; all of them collide
  if (compact) xTicks = xTicks.filter((_, i) => i % 2 === 0);

  /* The y top follows the board's best run, like the maps — a trajectory that
     outscores the board (a demo pipeline can) lifts it rather than clipping. */
  const endBest = Math.max(0, ...series.map((s) => {
    const last = s.shots[s.shots.length - 1];
    return (last && last.cum_fixed) || 0;
  }));
  const yTop = Math.min(CEILING, Math.ceil((Math.max(bestFixed || 0, endBest) + 4) / 10) * 10);
  const y = (s) => m.top + plotH - (s / yTop) * plotH;

  const geom = series.map((s) => {
    const color = runColor(s.run.color);
    let prevPhase = null;
    const points = [];
    s.shots.forEach((sh) => {
      const cost = sh.cum_cost_usd;
      const fixed = sh.cum_fixed;
      // no place on a log axis for a point with no positive cost
      if (!(cost > 0) || fixed === null || fixed === undefined) return;
      const cache = sh.cum_cost_cache_read_usd || 0;
      const fresh = cost - cache;
      const phase = (sh.phase === null || sh.phase === undefined) ? prevPhase : sh.phase;
      const handoff = prevPhase !== null && phase !== null && phase !== prevPhase;
      prevPhase = phase;
      points.push({
        shot: sh,
        cx: x(cost),
        cy: y(fixed),
        color,
        cacheX0: cache > 0 && fresh > 0 ? x(fresh) : null,
        handoff,
        numPos: null,
      });
    });
    let d = '';
    points.forEach((p, i) => { d += `${i ? ' L' : 'M'}${p.cx.toFixed(1)} ${p.cy.toFixed(1)}`; });
    return {
      ...s, color, points, path: d, label: null, labelPos: null, labelAnchor: 'start',
    };
  });

  // Endpoint labels first, best endpoint first — the maps' greedy placement.
  const labels = pointLabels(series.map((s) => s.run));
  const placedRects = [];
  const pointRects = [];
  geom.forEach((g) => {
    g.points.forEach((p) => pointRects.push({
      x0: p.cx - 8, x1: p.cx + 8, y0: p.cy - 8, y1: p.cy + 8,
    }));
  });
  const tryPlace = (text, font, cx, cy, cands) => {
    const w = measureText(text, font);
    for (const [dx, dy, anchor] of cands) {
      const lx = cx + dx;
      const ly = cy + dy;
      const x0 = anchor === 'start' ? lx : anchor === 'end' ? lx - w : lx - w / 2;
      const rect = { x0: x0 - 2, x1: x0 + w + 2, y0: ly - 9, y1: ly + 3 };
      if (rect.x0 < 2 || rect.x1 > width - 2 || rect.y0 < 6 || rect.y1 > m.top + plotH + 4) continue;
      if (placedRects.some((r) => overlaps(rect, r))) continue;
      if (pointRects.some((r) => overlaps(rect, r))) continue;
      placedRects.push(rect);
      return { x: lx, y: ly, anchor };
    }
    return null;
  };
  geom
    .slice()
    .sort((a, b) => {
      const ea = a.points.length ? a.points[a.points.length - 1].shot.cum_fixed : -1;
      const eb = b.points.length ? b.points[b.points.length - 1].shot.cum_fixed : -1;
      return eb - ea;
    })
    .forEach((g) => {
      const base = labels.get(g.run.id) || g.run.model;
      g.label = g.demo ? `${base} · DEMO` : base;
      const end = g.points[g.points.length - 1];
      if (end) {
        const pos = tryPlace(g.label, LABEL_FONT, end.cx, end.cy, CANDIDATES);
        if (pos) {
          g.labelPos = pos;
          g.labelAnchor = pos.anchor;
        }
      }
    });
  // Shot numerals last, one offset each — the "1/2/3/4/5" reading. A numeral
  // that would collide is dropped, never nudged onto another point.
  geom.forEach((g) => {
    g.points.forEach((p) => {
      p.numPos = tryPlace(String(p.shot.shot), NUM_FONT, p.cx, p.cy, [NUM_OFFSET]);
    });
  });

  const yStep = yTop > 60 ? 20 : 10;
  const yTicks = [];
  for (let v = 0; v <= yTop; v += yStep) yTicks.push({ v, y: y(v) });

  return {
    width, height, m, plotW, plotH, compact,
    x, y, xTicks, yTicks, yTop, series: geom,
    skipped: geom.filter((g) => !g.points.length),
    hasCache: geom.some((g) => g.points.some((p) => p.cacheX0 !== null)),
    hasHandoff: geom.some((g) => g.points.some((p) => p.handoff)),
    ceilingY: yTop === CEILING ? y(CEILING) : null, baseY: y(0),
  };
}

/** Flat sentences describing what the view shows, for the PNG export (which has
    no links) — the on-screen footnote in main.js says the same things, with links. */
export function shotsNoteText(L, demoOn) {
  const lines = [
    'Each line is one run\u2019s shots in order; each point plots cumulative fixes against cumulative cost after that shot. Cost is on a logarithmic axis.',
  ];
  if (L.hasCache) lines.push('The grey stub behind a point is the cached dollars inside its cost.');
  if (L.hasHandoff) lines.push('A diamond marks a pipeline handoff, where the cheap model hands the run to the smart one.');
  if (demoOn) lines.push('DEMO sample data — illustrative trajectories, not measured runs.');
  return lines;
}

function tipRow(label, value) {
  return el('div', { class: 'tip-row' }, [`${label}: ${value}`]);
}

function tooltipContent(p, s) {
  const r = s.run;
  const sh = p.shot;
  const frag = document.createDocumentFragment();
  frag.appendChild(el('span', { class: 'tip-val', text: `Shot ${sh.shot} — ${trimNum(sh.cum_fixed)} of 105 fixed` }));
  frag.appendChild(el('div', { class: 'tip-name' }, [
    el('i', { class: 'tip-key', style: { 'background-color': p.color } }),
    `${r.model}${r.effort ? ` · ${r.effort}` : ''}${s.demo ? ' · DEMO' : ''}`,
  ]));
  if (sh.new_fixed !== null && sh.new_fixed !== undefined) {
    frag.appendChild(tipRow('New this shot', trimNum(sh.new_fixed)));
  }
  const cache = sh.cum_cost_cache_read_usd || 0;
  const cacheShare = sh.cum_cost_usd > 0 ? Math.round((cache / sh.cum_cost_usd) * 100) : 0;
  frag.appendChild(tipRow('Cumulative cost',
    cache > 0
      ? `${fmtCost(sh.cum_cost_usd)} (${fmtCost(cache)} from cache, ${cacheShare}%)`
      : fmtCost(sh.cum_cost_usd)));
  if (sh.repo1_fixed !== null && sh.repo1_fixed !== undefined
    && sh.repo2_fixed !== null && sh.repo2_fixed !== undefined) {
    frag.appendChild(tipRow('Repo split', `${trimNum(sh.repo1_fixed)} + ${trimNum(sh.repo2_fixed)}`));
  }
  if (sh.phase_model) frag.appendChild(tipRow(`Phase ${sh.phase || 1}`, sh.phase_model));
  if (p.handoff) {
    frag.appendChild(el('div', { class: 'tip-note', text: 'Handoff: the cheap model hands the run to the smart one at this shot.' }));
  } else if (sh.model_declared_done) {
    frag.appendChild(el('div', { class: 'tip-note', text: 'The model declared no more bugs after this shot.' }));
  }
  return frag;
}

export function renderShots(host, series, domainShots, bestFixed, footnote) {
  host.classList.add('chart-host');
  host.textContent = '';
  if (!series.length) return null;

  const width = Math.max(320, host.clientWidth || 900);
  const height = width < 620 ? 400 : Math.min(520, Math.round(width * 0.46));
  const L = shotsLayout(series, domainShots, bestFixed, width, height);

  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    'aria-label': 'Cumulative planted bugs fixed plotted against cumulative run cost, one point per shot. Run totals are also in the leaderboard table.',
  });
  svg.appendChild(svgEl('title', { text: `${SHOTS_META.chartTitle}, for the selected runs` }));

  const grid = svgEl('g', { 'aria-hidden': 'true' });
  L.yTicks.forEach((t) => {
    grid.appendChild(svgEl('line', {
      class: 'grid-line', x1: L.m.left, x2: L.m.left + L.plotW, y1: t.y, y2: t.y,
    }));
    grid.appendChild(svgEl('text', {
      class: 'tick-label', x: L.m.left - 8, y: t.y + 3.5, 'text-anchor': 'end', text: String(t.v),
    }));
  });
  L.xTicks.forEach((t) => {
    grid.appendChild(svgEl('line', {
      class: 'grid-line', x1: t.x, x2: t.x, y1: L.m.top, y2: L.m.top + L.plotH,
    }));
    grid.appendChild(svgEl('text', {
      class: 'tick-label', x: t.x, y: L.m.top + L.plotH + 18, 'text-anchor': 'middle', text: t.label,
    }));
  });
  grid.appendChild(svgEl('line', {
    class: 'axis-line', x1: L.m.left, x2: L.m.left + L.plotW, y1: L.baseY, y2: L.baseY,
  }));
  grid.appendChild(svgEl('line', {
    class: 'axis-line', x1: L.m.left, x2: L.m.left, y1: L.m.top, y2: L.baseY,
  }));
  svg.appendChild(grid);

  const ceil = svgEl('g', { 'aria-hidden': 'true' });
  if (L.ceilingY !== null) {
    ceil.appendChild(svgEl('line', {
      class: 'axis-line', x1: L.m.left, x2: L.m.left + L.plotW, y1: L.ceilingY, y2: L.ceilingY,
    }));
    ceil.appendChild(svgEl('text', {
      class: 'ceiling-label', x: L.m.left + L.plotW, y: L.ceilingY - 7, 'text-anchor': 'end',
      text: '105 — every planted bug',
    }));
  }
  ceil.appendChild(svgEl('text', {
    class: 'corner-label', x: L.m.left + 8, y: L.m.top + 16, text: SHOTS_META.corner,
  }));
  svg.appendChild(ceil);

  // axis titles
  svg.appendChild(svgEl('text', {
    class: 'axis-title', x: L.m.left, y: height - 14,
    text: L.compact ? SHOTS_META.titleCompact : SHOTS_META.title,
  }));
  svg.appendChild(svgEl('text', {
    class: 'axis-title', x: -(L.m.top + L.plotH / 2), y: 13,
    transform: 'rotate(-90)', 'text-anchor': 'middle',
    text: L.compact ? 'Fixed, of 105' : 'Cumulative planted bugs fixed, out of 105',
  }));

  L.series.forEach((s) => {
    if (s.points.length > 1) {
      svg.appendChild(svgEl('path', { class: 'shot-line', d: s.path, stroke: s.color, 'aria-hidden': 'true' }));
    }
  });

  const tip = el('div', { class: 'chart__tip', role: 'status', hidden: true });
  const marks = svgEl('g', {});

  const showTip = (p, s, group) => {
    tip.textContent = '';
    tip.appendChild(tooltipContent(p, s));
    tip.hidden = false;
    const hostW = host.clientWidth;
    const scale = hostW / width;
    const tw = tip.offsetWidth;
    let left = p.cx * scale + 14;
    if (left + tw > hostW - 6) left = p.cx * scale - tw - 14;
    if (left < 4) left = 4;
    tip.style.setProperty('left', `${left}px`);
    tip.style.setProperty('top', `${Math.max(4, p.cy * scale - 12)}px`);
    group.classList.add('is-active');
  };
  const hideTip = (group) => {
    tip.hidden = true;
    if (group) group.classList.remove('is-active');
  };

  L.series.forEach((s) => {
    s.points.forEach((p) => {
      const g = svgEl('g', { class: 'pt' });
      if (p.cacheX0 !== null) {
        g.appendChild(svgEl('line', {
          class: 'shot-cache', x1: p.cacheX0, x2: p.cx, y1: p.cy, y2: p.cy, 'aria-hidden': 'true',
        }));
      }
      g.appendChild(svgEl('circle', { class: 'pt-ring', cx: p.cx, cy: p.cy, r: 7 }));
      if (p.handoff) {
        const r = 6;
        g.appendChild(svgEl('path', {
          class: 'shot-handoff',
          d: `M${p.cx} ${(p.cy - r).toFixed(1)} L${(p.cx + r).toFixed(1)} ${p.cy} L${p.cx} ${(p.cy + r).toFixed(1)} L${(p.cx - r).toFixed(1)} ${p.cy} Z`,
          fill: p.color,
        }));
      } else {
        g.appendChild(svgEl('circle', { cx: p.cx, cy: p.cy, r: 5, fill: p.color }));
      }
      if (p.numPos) {
        g.appendChild(svgEl('text', {
          class: 'shot-num', x: p.numPos.x, y: p.numPos.y,
          'text-anchor': p.numPos.anchor, text: String(p.shot.shot), 'aria-hidden': 'true',
        }));
      }
      const hit = svgEl('circle', {
        class: 'hit', cx: p.cx, cy: p.cy, r: 16, tabindex: '0', role: 'button',
        'aria-label': `${s.run.model}, shot ${p.shot.shot}: ${trimNum(p.shot.cum_fixed)} of 105 fixed, ${fmtCost(p.shot.cum_cost_usd)} cumulative${p.handoff ? '. Pipeline handoff at this shot' : ''}${p.shot.model_declared_done ? '. Model declared no more bugs' : ''}`,
      });
      hit.addEventListener('pointerenter', () => showTip(p, s, g));
      hit.addEventListener('pointerleave', () => hideTip(g));
      hit.addEventListener('focus', () => showTip(p, s, g));
      hit.addEventListener('blur', () => hideTip(g));
      g.appendChild(hit);
      marks.appendChild(g);
    });
    if (s.labelPos) {
      marks.appendChild(svgEl('text', {
        class: 'pt-label', x: s.labelPos.x, y: s.labelPos.y,
        'text-anchor': s.labelPos.anchor, text: s.label,
      }));
    }
  });
  svg.appendChild(marks);

  host.appendChild(svg);
  host.appendChild(tip);

  /* What the marks ARE, inside the plate with the plot — the maps' rule that
     the definition travels with the chart, not somewhere below it. */
  if (footnote) {
    const parts = footnote(L);
    if (parts) host.appendChild(el('p', { class: 'chart__def' }, parts));
  }

  if (L.skipped.length) {
    const names = L.skipped.map((g) => g.run.model).join(', ');
    host.appendChild(el('p', {
      class: 'chart__def chart__def--skip',
      text: `${names} ${L.skipped.length === 1 ? 'carries' : 'carry'} shot data with no plottable cost figure. ${L.skipped.length === 1 ? 'It is' : 'They are'} in the table.`,
    }));
  }

  return L;
}

