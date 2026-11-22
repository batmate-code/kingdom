import { PLOTS } from '@vampire/data';
import {
  CARD,
  CITY_ENTRY_BOX,
  HEX_R,
  LOCATION_CENTERS,
  PLOT_CENTERS,
  REGION_SHAPES,
  STARS,
  TRACK_BOXES,
  CITY_DY,
  SX,
  VIEW,
  points,
  sx,
} from './geometry';

/**
 * Пейзаж под схемой поля (из макета-карты по наброску автора): фактура земли, река в просветах
 * между регионами, ельник в Лесу, горы и развалины в Долине, крыши и стена в Городе.
 * Ничего не ставится под карточки, участки, звёзды, треки и линии связей — схема остаётся читаемой.
 */

type Pt = readonly [number, number];
const INK = '#cdb88f';

/** Пары «x y» пути из сетки картона: X растянуть, Y сдвинуть ниже Города (всё, что под Городом). */
function scalePath(d: string): string {
  return d.replace(
    /(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g,
    (_, x: string, y: string) => `${Number(x) * SX} ${Number(y) + CITY_DY}`,
  );
}

/** Река: вдоль просвета Город/Лес, под остриём Города и вдоль просвета Город/Долина. */
const RIVER = scalePath(
  'M -30 625 C 180 610, 300 560, 520 600 S 800 720, 930 935 Q 1000 1010 1075 935 S 1240 700, 1335 645 S 1560 595, 1720 618 S 1900 588, 2040 576',
);

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function inside([x, y]: Pt, poly: readonly Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function segDist([px, py]: Pt, [ax, ay]: Pt, [bx, by]: Pt): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

const LINKS: [Pt, Pt][] = PLOTS.flatMap((p) => {
  const a = PLOT_CENTERS[p.id];
  return a ? p.adjacent.map((l): [Pt, Pt] => [a, LOCATION_CENTERS[l]]) : [];
});

/** Свободно ли место под пейзаж (с запасом margin). */
function free(p: Pt, margin: number): boolean {
  const [x, y] = p;
  for (const [cx, cy] of Object.values(LOCATION_CENTERS)) {
    if (Math.abs(x - cx) < CARD.width / 2 + margin && Math.abs(y - cy) < CARD.height / 2 + margin)
      return false;
  }
  for (const c of Object.values(PLOT_CENTERS)) {
    if (Math.hypot(x - c[0], y - c[1]) < HEX_R + margin) return false;
  }
  for (const c of Object.values(STARS)) {
    if (Math.hypot(x - c[0], y - c[1]) < 85 + margin + 40) return false;
  }
  for (const b of Object.values(TRACK_BOXES)) {
    if (x > b.x - margin && x < b.x + b.w + margin && y > b.y - margin && y < b.y + 620)
      return false;
  }
  const e = CITY_ENTRY_BOX;
  if (x > e.x - margin && x < e.x + e.w + margin && y > e.y - margin && y < e.y + e.h + margin)
    return false;
  for (const [a, b] of LINKS) if (segDist(p, a, b) < margin * 0.6 + 6) return false;
  return true;
}

interface Glyph {
  x: number;
  y: number;
  s: number;
}

function scatter(
  region: 'city' | 'forest' | 'valley',
  seed: number,
  count: number,
  margin: number,
  inset: number,
): Glyph[] {
  const rnd = seeded(seed);
  const poly = REGION_SHAPES[region];
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const out: Glyph[] = [];
  for (let i = 0; i < count * 30 && out.length < count; i++) {
    const p: Pt = [x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0)];
    // Отступ от края региона: точка и её соседи по кругу должны быть внутри.
    const ok = [0, 1, 2, 3].every((k) =>
      inside([p[0] + inset * Math.cos(k * 1.57), p[1] + inset * Math.sin(k * 1.57)], poly),
    );
    if (!ok || !free(p, margin)) continue;
    if (out.some((g) => Math.hypot(g.x - p[0], g.y - p[1]) < margin * 0.9)) continue;
    out.push({ x: p[0], y: p[1], s: 0.75 + rnd() * 0.5 });
  }
  return out.sort((a, b) => a.y - b.y);
}

const TREES = scatter('forest', 7, 160, 46, 40);
const MOUNTAINS = scatter('valley', 13, 26, 70, 70);
const VALLEY_TREES = scatter('valley', 29, 30, 30, 35);
const HOUSES = scatter('city', 3, 55, 50, 45);

export function LandscapeDefs() {
  return (
    <>
      <filter id="l-ground" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.0035" numOctaves="4" seed="11" />
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0.13  0 0 0 0 0.1  0 0 0 0 0.08  0 0 0 -1.4 1.25"
        />
      </filter>
      <filter id="l-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" />
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.9 0.55" />
      </filter>
      <filter id="l-ink" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.035"
          numOctaves="2"
          seed="5"
          result="n"
        />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="6" />
      </filter>
      <linearGradient id="l-river" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#1d2c36" />
        <stop offset="100%" stopColor="#101b23" />
      </linearGradient>
      <linearGradient id="l-mountain" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#4a4146" />
        <stop offset="50%" stopColor="#352d32" />
        <stop offset="50%" stopColor="#221b20" />
        <stop offset="100%" stopColor="#191418" />
      </linearGradient>
    </>
  );
}

/** Земля под всем полем и река (регионы рисуются поверх и прячут лишнее). */
export function Ground() {
  return (
    <g>
      <rect width={VIEW.width} height={VIEW.height} fill="#17130f" />
      <rect width={VIEW.width} height={VIEW.height} filter="url(#l-ground)" />
      <rect width={VIEW.width} height={VIEW.height} filter="url(#l-grain)" opacity={0.55} />
      <g filter="url(#l-ink)">
        <path d={RIVER} fill="none" stroke="#0a1015" strokeWidth={96} strokeLinecap="round" />
        <path d={RIVER} fill="none" stroke="url(#l-river)" strokeWidth={80} strokeLinecap="round" />
        <path
          d={RIVER}
          fill="none"
          stroke="#7d98a4"
          strokeOpacity={0.3}
          strokeWidth={3}
          strokeDasharray="26 40"
        />
      </g>
    </g>
  );
}

function Tree({ g, fill }: { g: Glyph; fill: string }) {
  return (
    <g transform={`translate(${g.x} ${g.y}) scale(${g.s * 0.8})`}>
      <path
        d="M0 -62 L18 -30 L9 -30 L26 -2 L13 -2 L32 26 L-32 26 L-13 -2 L-26 -2 L-9 -30 L-18 -30 Z"
        fill={fill}
        stroke={INK}
        strokeOpacity={0.42}
        strokeWidth={2}
      />
      <rect x={-4} y={26} width={8} height={10} fill="#22180f" />
    </g>
  );
}

/** Пейзаж внутри регионов: поверх заливки, под схемой. */
export function Scenery() {
  return (
    <g filter="url(#l-ink)" opacity={0.85}>
      {TREES.map((g, i) => (
        <Tree key={`t${i}`} g={g} fill="#21402b" />
      ))}
      {VALLEY_TREES.map((g, i) => (
        <Tree key={`v${i}`} g={{ ...g, s: g.s * 0.8 }} fill="#2a1416" />
      ))}
      {MOUNTAINS.map((m, i) => {
        const w = 120 * m.s;
        const h = 95 * m.s;
        return (
          <g key={`m${i}`}>
            <path
              d={`M ${m.x - w / 2} ${m.y + h / 2} L ${m.x} ${m.y - h / 2} L ${m.x + w / 2} ${m.y + h / 2} Z`}
              fill="url(#l-mountain)"
              stroke={INK}
              strokeOpacity={0.4}
              strokeWidth={2.5}
            />
            <path
              d={`M ${m.x} ${m.y - h / 2} l ${-w * 0.12} ${h * 0.28} l ${w * 0.08} ${-h * 0.06} l ${w * 0.05} ${h * 0.12} l ${w * 0.08} ${-h * 0.2} Z`}
              fill="#d9d2c3"
              opacity={0.3}
            />
          </g>
        );
      })}
      {HOUSES.map((h, i) => {
        const s = h.s * 0.9;
        return (
          <g key={`h${i}`} transform={`translate(${h.x} ${h.y}) scale(${s})`}>
            <rect
              x={-18}
              y={-6}
              width={36}
              height={26}
              fill="#262229"
              stroke={INK}
              strokeOpacity={0.3}
              strokeWidth={2}
            />
            <path
              d="M -24 -4 L 0 -26 L 24 -4 Z"
              fill="#3a2125"
              stroke={INK}
              strokeOpacity={0.3}
              strokeWidth={2}
            />
            <rect x={-5} y={6} width={10} height={14} fill="#0d0a0c" />
          </g>
        );
      })}
      {/* Развалины у Мессы. */}
      <g fill="#3a3336" stroke={INK} strokeOpacity={0.5} strokeWidth={2.5}>
        <rect x={1460 * SX} y={1505 + CITY_DY} width={20} height={56} />
        <rect x={1492 * SX} y={1525 + CITY_DY} width={20} height={36} />
        <rect x={1525 * SX} y={1515 + CITY_DY} width={20} height={46} />
        <path d={scalePath('M 1448 1505 L 1496 1505 L 1490 1494 L 1454 1494 Z')} />
      </g>
    </g>
  );
}

/** Стена Города по контуру региона: башни на углах. */
export function CityWall() {
  const shape = REGION_SHAPES.city;
  const d = `M ${points(shape).replace(/ /g, ' L ')} Z`;
  return (
    <g filter="url(#l-ink)">
      <path d={d} fill="none" stroke="#0e0b0f" strokeWidth={26} strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#5b5254" strokeWidth={16} strokeLinejoin="round" />
      <path
        d={d}
        fill="none"
        stroke={INK}
        strokeOpacity={0.45}
        strokeWidth={2.5}
        strokeDasharray="12 9"
      />
      {shape.map(([x, y], i) => (
        <g key={i}>
          <rect
            x={x - 20}
            y={y - 20}
            width={40}
            height={40}
            rx={5}
            fill="#3d3638"
            stroke={INK}
            strokeOpacity={0.55}
            strokeWidth={2.5}
          />
          <path
            d={`M ${x - 20} ${y - 20} l 8 -9 l 8 9 l 8 -9 l 8 9 l 8 -9`}
            fill="none"
            stroke={INK}
            strokeOpacity={0.45}
            strokeWidth={2.5}
          />
        </g>
      ))}
    </g>
  );
}

/** Сглаженный замкнутый контур (Catmull-Rom → кубические Безье). */
export function smooth(poly: readonly Pt[]): string {
  const n = poly.length;
  const p = (i: number) => poly[((i % n) + n) % n]!;
  let d = `M ${p(0)[0]} ${p(0)[1]}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
  }
  return `${d} Z`;
}

/** Госпиталь — сад-трапеция в просвете между Лесом и Долиной, с отступами от регионов и трека престижа; с часовней, дорожкой, кустами и цветами. */
// Трапеция с прямыми боками, параллельными краям Леса и Долины (отступ ~22), углы скруглены.
const HOSPITAL: readonly Pt[] = (
  [
    [962, 1262],
    [1038, 1262],
    [1185, 1592],
    [815, 1592],
  ] as const
).map((p) => sx([p[0], p[1] + CITY_DY]));
const BUSHES: readonly Pt[] = (
  [
    [848, 1568],
    [1152, 1568],
    [880, 1530],
    [1120, 1530],
  ] as const
).map((p) => sx([p[0], p[1] + CITY_DY]));

/** Многоугольник со скруглёнными углами радиуса r. */
function rounded(poly: readonly Pt[], r: number): string {
  const n = poly.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n]!;
    const cur = poly[i]!;
    const next = poly[(i + 1) % n]!;
    const toward = (a: Pt, b: Pt) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = Math.min(r, len / 2) / len;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k] as const;
    };
    const p1 = toward(cur, prev);
    const p2 = toward(cur, next);
    d += `${i === 0 ? 'M' : 'L'} ${p1[0]} ${p1[1]} Q ${cur[0]} ${cur[1]} ${p2[0]} ${p2[1]} `;
  }
  return `${d}Z`;
}

export function HospitalGarden() {
  const d = rounded(HOSPITAL, 26);
  return (
    <g>
      <defs>
        <radialGradient id="l-meadow" cx="50%" cy="55%" r="60%">
          <stop offset="0%" stopColor="#4d5a48" />
          <stop offset="70%" stopColor="#323d32" />
          <stop offset="100%" stopColor="#222a23" />
        </radialGradient>
      </defs>
      <path d={d} fill="url(#l-meadow)" filter="url(#regionEdge)" />
      <path d={d} fill="url(#l-meadow)" filter="url(#cloth)" opacity={0.6} />
      <path d={d} fill="none" stroke="#e3cf98" strokeOpacity={0.45} strokeWidth={3} />
      {/* Дорожка к часовне. */}
      <path
        d={scalePath('M 1000 1588 C 975 1550, 1025 1500, 995 1450 S 1000 1380, 1000 1360')}
        fill="none"
        stroke="#8c7a5d"
        strokeOpacity={0.45}
        strokeWidth={22}
        strokeLinecap="round"
      />
      {/* Часовня. */}
      <g transform={`translate(${1000 * SX} ${1322 + CITY_DY})`} filter="url(#l-ink)">
        <rect
          x={-26}
          y={-6}
          width={52}
          height={36}
          fill="#e1d6c0"
          stroke="#2a2420"
          strokeWidth={2}
        />
        <path d="M -32 -4 L 0 -30 L 32 -4 Z" fill="#6b3a3a" stroke="#2a2420" strokeWidth={2} />
        <rect x={-7} y={12} width={14} height={18} rx={6} fill="#3a2a22" />
        <path d="M 0 -50 L 0 -32 M -7 -43 L 7 -43" stroke="#e1d6c0" strokeWidth={4} />
      </g>
      {BUSHES.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x - 10} cy={y + 3} r={13} fill="#24361f" />
          <circle cx={x + 10} cy={y + 2} r={12} fill="#2c4126" />
          <circle cx={x} cy={y - 6} r={14} fill="#35502e" />
          <circle cx={x - 3} cy={y - 11} r={5} fill="#4f6d42" opacity={0.7} />
        </g>
      ))}
    </g>
  );
}
