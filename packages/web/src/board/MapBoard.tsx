import { plotSurcharge, type Observation } from '@vampire/core';
import {
  BUILDINGS,
  LOCATIONS,
  LOCATION_ORDER,
  PLOTS,
  REGION_ORDER,
  type LocationId,
  type RegionId,
  type Resources,
} from '@vampire/data';
import { useMemo } from 'react';
import { PLAYER_COLORS, slotLines } from '../Board';
import { profColor } from '../colors';
import { EntryPrice } from '../EntryPrice';
import { Icon, RichText } from '../Icon';
import { locName } from '../labels';
import { Html, Token } from './BoardSvg';
import styles from './MapBoard.module.css';
import {
  BRIDGES,
  ENTRY_AT,
  GATES,
  HOSPITAL_AT,
  LOC,
  LOC_FLAVOR,
  MAP,
  MOUNTAINS,
  OVAL,
  PLOT_AT,
  PLOT_R,
  RIVER,
  ROADS,
  STAR_AT,
  WALL,
  occupied,
  pts,
  seeded,
  starPts,
  type Pt,
} from './mapGeometry';

const INK = '#cdb88f';
const GOLD = '#c9a24a';
const RES_SHORT: Record<keyof Resources, string> = {
  gold: 'зол',
  blood: 'кр',
  ore: 'руд',
  compromat: 'комп',
};

function Defs() {
  return (
    <defs>
      {/* Земля: крупные пятна + зерно бумаги. */}
      <filter id="m-ground" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.0035" numOctaves="4" seed="11" />
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0.16  0 0 0 0 0.12  0 0 0 0 0.09  0 0 0 -1.4 1.25"
        />
      </filter>
      <filter id="m-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" />
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.9 0.55" />
      </filter>
      {/* Дрожание линии «от руки». */}
      <filter id="m-ink" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.035"
          numOctaves="2"
          seed="5"
          result="n"
        />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="7" />
      </filter>
      <filter id="m-soft" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="60" />
      </filter>
      <filter id="m-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="8" stdDeviation="9" floodColor="#000" floodOpacity="0.75" />
      </filter>
      <filter id="tokenShadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000" floodOpacity="0.8" />
      </filter>
      <filter id="m-glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="12" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <radialGradient id="m-vignette" cx="50%" cy="48%" r="72%">
        <stop offset="55%" stopColor="#000" stopOpacity="0" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.8" />
      </radialGradient>
      <radialGradient id="m-plaque" cx="50%" cy="35%" r="75%">
        <stop offset="0%" stopColor="#2c2329" />
        <stop offset="100%" stopColor="#140f16" />
      </radialGradient>
      <radialGradient id="m-socket" cx="50%" cy="40%" r="60%">
        <stop offset="0%" stopColor="#09070b" />
        <stop offset="80%" stopColor="#18121a" />
        <stop offset="100%" stopColor="#3a2f36" />
      </radialGradient>
      <radialGradient id="m-plot" cx="45%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#4a4045" />
        <stop offset="100%" stopColor="#1b161d" />
      </radialGradient>
      <linearGradient id="m-gold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f4dc93" />
        <stop offset="55%" stopColor="#c9a24a" />
        <stop offset="100%" stopColor="#7d5f22" />
      </linearGradient>
      <linearGradient id="m-river" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#1c2a33" />
        <stop offset="100%" stopColor="#0f1a22" />
      </linearGradient>
      <linearGradient id="m-mountain" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#3b3437" />
        <stop offset="50%" stopColor="#2a2427" />
        <stop offset="50%" stopColor="#1b1619" />
        <stop offset="100%" stopColor="#141013" />
      </linearGradient>
      <marker
        id="m-arrow"
        viewBox="0 0 10 10"
        refX="6"
        refY="5"
        markerWidth="5"
        markerHeight="5"
        orient="auto"
      >
        <path d="M0,0 L10,5 L0,10 z" fill={GOLD} fillOpacity="0.85" />
      </marker>
    </defs>
  );
}

/** Подложка: земля, оттенки регионов, горы, лес, река, стена, дороги, мосты. */
function Terrain() {
  const trees = useMemo(() => {
    const rnd = seeded(42);
    const out: { x: number; y: number; s: number }[] = [];
    // Лес справа — густо; в Долине — редкие деревья.
    for (let i = 0; i < 520 && out.length < 150; i++) {
      const p: Pt = [1720 + rnd() * 680, 120 + rnd() * 1330];
      if (!occupied(p)) out.push({ x: p[0], y: p[1], s: 0.7 + rnd() * 0.6 });
    }
    for (let i = 0; i < 200 && out.length < 175; i++) {
      const p: Pt = [40 + rnd() * 640, 520 + rnd() * 980];
      if (!occupied(p) && rnd() < 0.5) out.push({ x: p[0], y: p[1], s: 0.6 + rnd() * 0.5 });
    }
    return out.sort((a, b) => a.y - b.y);
  }, []);

  const wallPath = `M ${pts(WALL).replace(/ /g, ' L ')} Z`;

  return (
    <g>
      <rect width={MAP.width} height={MAP.height} fill="#1d1813" />
      <rect width={MAP.width} height={MAP.height} filter="url(#m-ground)" />
      {/* Оттенки регионов — размытые пятна, без жёстких границ. */}
      <g filter="url(#m-soft)" opacity={0.75}>
        <ellipse cx={380} cy={820} rx={470} ry={720} fill="#4a1c22" />
        <ellipse cx={2050} cy={800} rx={480} ry={760} fill="#1f3524" />
        <ellipse cx={1240} cy={690} rx={560} ry={520} fill="#34303d" />
      </g>
      <rect width={MAP.width} height={MAP.height} filter="url(#m-grain)" opacity={0.6} />

      {/* Горы за развалинами. */}
      <g filter="url(#m-ink)">
        {MOUNTAINS.map((m, i) => (
          <g key={i}>
            <path
              d={`M ${m.x} ${m.y} L ${m.x + m.w / 2} ${m.y - m.h} L ${m.x + m.w} ${m.y} Z`}
              fill="url(#m-mountain)"
              stroke={INK}
              strokeOpacity={0.55}
              strokeWidth={3}
            />
            <path
              d={`M ${m.x + m.w / 2} ${m.y - m.h} l ${-m.w * 0.12} ${m.h * 0.28} l ${m.w * 0.08} ${-m.h * 0.05} l ${m.w * 0.05} ${m.h * 0.12} l ${m.w * 0.08} ${-m.h * 0.2} Z`}
              fill="#d9d2c3"
              opacity={0.35}
            />
          </g>
        ))}
      </g>

      {/* Река. */}
      <g filter="url(#m-ink)">
        <path d={RIVER} fill="none" stroke="#0b1116" strokeWidth={78} strokeLinecap="round" />
        <path d={RIVER} fill="none" stroke="url(#m-river)" strokeWidth={62} strokeLinecap="round" />
        <path
          d={RIVER}
          fill="none"
          stroke="#6f8a96"
          strokeOpacity={0.35}
          strokeWidth={4}
          strokeDasharray="30 40"
        />
      </g>

      {/* Дороги. */}
      <g filter="url(#m-ink)" fill="none" strokeLinecap="round">
        {ROADS.map(([a, b], i) => {
          const mx = (a[0] + b[0]) / 2 + (i % 2 ? 40 : -40);
          const my = (a[1] + b[1]) / 2 + (i % 2 ? -30 : 30);
          const d = `M ${a[0]} ${a[1]} Q ${mx} ${my} ${b[0]} ${b[1]}`;
          return (
            <g key={i}>
              <path d={d} stroke="#3c3023" strokeWidth={26} />
              <path d={d} stroke={INK} strokeOpacity={0.3} strokeWidth={3} strokeDasharray="6 14" />
            </g>
          );
        })}
      </g>

      {/* Деревья. */}
      <g filter="url(#m-ink)">
        {trees.map((t, i) => (
          <g key={i} transform={`translate(${t.x} ${t.y}) scale(${t.s})`}>
            <path
              d="M0 -62 L18 -30 L9 -30 L26 -2 L13 -2 L32 26 L-32 26 L-13 -2 L-26 -2 L-9 -30 L-18 -30 Z"
              fill={t.x > 1600 ? '#1c3022' : '#2b2419'}
              stroke={INK}
              strokeOpacity={0.35}
              strokeWidth={2}
            />
            <rect x={-4} y={26} width={8} height={12} fill="#2a1f17" />
          </g>
        ))}
      </g>

      {/* Стена Города с башнями и воротами. */}
      <g filter="url(#m-ink)">
        <path d={wallPath} fill="none" stroke="#0e0b0f" strokeWidth={34} strokeLinejoin="round" />
        <path d={wallPath} fill="none" stroke="#5b5254" strokeWidth={22} strokeLinejoin="round" />
        <path
          d={wallPath}
          fill="none"
          stroke={INK}
          strokeOpacity={0.5}
          strokeWidth={3}
          strokeDasharray="14 10"
        />
        {WALL.map(([x, y], i) => (
          <g key={i}>
            <rect
              x={x - 26}
              y={y - 26}
              width={52}
              height={52}
              rx={6}
              fill="#3d3638"
              stroke={INK}
              strokeOpacity={0.6}
              strokeWidth={3}
            />
            <path
              d={`M ${x - 26} ${y - 26} l 10 -12 l 10 12 l 12 -12 l 10 12 l 10 -12 l 10 12`}
              fill="none"
              stroke={INK}
              strokeOpacity={0.5}
              strokeWidth={3}
            />
          </g>
        ))}
        {GATES.map((side) => {
          const a = WALL[side]!;
          const b = WALL[(side + 1) % WALL.length]!;
          const x = (a[0] + b[0]) / 2;
          const y = (a[1] + b[1]) / 2;
          return (
            <g key={side}>
              <rect
                x={x - 34}
                y={y - 34}
                width={68}
                height={68}
                rx={8}
                fill="#2b2426"
                stroke={INK}
                strokeOpacity={0.7}
                strokeWidth={3}
              />
              <path
                d={`M ${x - 16} ${y + 26} L ${x - 16} ${y - 4} A 16 16 0 0 1 ${x + 16} ${y - 4} L ${x + 16} ${y + 26} Z`}
                fill="#0c090a"
              />
            </g>
          );
        })}
      </g>

      {/* Мосты. */}
      <g filter="url(#m-ink)">
        {BRIDGES.map(({ at: [x, y], angle }, i) => (
          <g key={i} transform={`translate(${x} ${y}) rotate(${angle})`}>
            <rect
              x={-60}
              y={-22}
              width={120}
              height={44}
              rx={6}
              fill="#4a3b2c"
              stroke={INK}
              strokeOpacity={0.7}
              strokeWidth={3}
            />
            {[-40, -20, 0, 20, 40].map((dx) => (
              <line key={dx} x1={dx} x2={dx} y1={-20} y2={20} stroke="#2a2018" strokeWidth={3} />
            ))}
          </g>
        ))}
      </g>

      {/* Развалины у Мессы: обломки колонн. */}
      <g filter="url(#m-ink)" fill="#3a3336" stroke={INK} strokeOpacity={0.6} strokeWidth={3}>
        <rect x={150} y={470} width={26} height={70} />
        <rect x={190} y={495} width={26} height={45} />
        <rect x={640} y={430} width={24} height={60} />
        <path d="M 136 470 L 230 470 L 222 455 L 144 455 Z" />
      </g>

      {/* Названия регионов, как на наброске. */}
      <text x={70} y={1000} className={styles.regionName} transform="rotate(-90 70 1000)">
        Долина
      </text>
      <text x={2200} y={140} className={styles.regionName}>
        Лес
      </text>
      <text x={1220} y={150} className={styles.regionName} textAnchor="middle">
        Город
      </text>
    </g>
  );
}

function Plaque({ id, obs }: { id: LocationId; obs: Observation }) {
  const [cx, cy] = LOC[id];
  const loc = obs.locations[id];
  const blocked = obs.blocks.some((b) => b.location === id);
  const sockets: [Pt, Pt] = [
    [cx - 88, cy - 8],
    [cx - 88, cy + 62],
  ];
  const flavor = LOC_FLAVOR[id];
  return (
    <g>
      <ellipse
        cx={cx}
        cy={cy}
        rx={OVAL.rx}
        ry={OVAL.ry}
        fill="url(#m-plaque)"
        stroke={GOLD}
        strokeWidth={3}
        filter="url(#m-shadow)"
      />
      <ellipse
        cx={cx}
        cy={cy}
        rx={OVAL.rx - 9}
        ry={OVAL.ry - 9}
        fill="none"
        stroke={GOLD}
        strokeOpacity={0.35}
        strokeWidth={1.5}
      />
      {flavor && (
        <text x={cx} y={cy - OVAL.ry - 14} textAnchor="middle" className={styles.flavor}>
          {flavor}
        </text>
      )}
      <Html x={cx - 130} y={cy - 104} w={260} h={44} className={styles.title}>
        {locName(id)}
        {blocked && ' 🔒'}
      </Html>
      {LOCATIONS[id].slots.map((action, i) => (
        <Html
          key={i}
          x={cx - 46}
          y={sockets[i as 0 | 1][1] - 32}
          w={190}
          h={64}
          className={styles.slotText}
        >
          {slotLines(action, obs).map((line, j) => (
            <div key={j}>
              <RichText text={line} />
            </div>
          ))}
        </Html>
      ))}
      {sockets.map(([sx, sy], i) => (
        <g key={i}>
          {i === 1 && loc.professionToken && (
            <circle
              cx={sx}
              cy={sy}
              r={34}
              fill="none"
              stroke={profColor(loc.professionToken)}
              strokeWidth={6}
            />
          )}
          <circle cx={sx} cy={sy} r={27} fill="url(#m-socket)" stroke={GOLD} strokeWidth={2} />
        </g>
      ))}
      <path
        d={`M ${sockets[1][0] - 36} ${sockets[1][1] - 6} Q ${sockets[0][0] - 56} ${(sockets[0][1] + sockets[1][1]) / 2} ${sockets[0][0] - 30} ${sockets[0][1] + 12}`}
        fill="none"
        stroke={GOLD}
        strokeOpacity={0.6}
        strokeWidth={3}
        markerEnd="url(#m-arrow)"
      />
      {obs.workers
        .filter((w) => w.position.kind === 'slot' && w.position.location === id)
        .map((w, i) => {
          const slot = w.position.kind === 'slot' ? w.position.slot : 1;
          const [sx, sy] = sockets[slot - 1]!;
          return <Token key={w.id} w={w} cx={sx + i * 6} cy={sy} r={24} />;
        })}
    </g>
  );
}

function PlotCircle({ id, obs }: { id: string; obs: Observation }) {
  const c = PLOT_AT[id];
  if (!c) return null;
  const built = obs.buildings.find((b) => b.plot === id);
  const plot = PLOTS.find((p) => p.id === id);
  const double = (plot?.adjacent.length ?? 1) > 1;
  const text = Object.entries(plotSurcharge(obs, id))
    .map(([k, v]) => `+${v} ${RES_SHORT[k as keyof Resources]}`)
    .join(' ');
  return (
    <g>
      <circle
        cx={c[0]}
        cy={c[1]}
        r={PLOT_R}
        fill={built ? PLAYER_COLORS[built.owner] : 'url(#m-plot)'}
        stroke={GOLD}
        strokeWidth={double ? 3 : 2}
        filter="url(#m-shadow)"
      />
      {double && !built && (
        <circle cx={c[0]} cy={c[1]} r={PLOT_R - 8} fill="none" stroke={GOLD} strokeOpacity={0.5} />
      )}
      <Html x={c[0] - 46} y={c[1] - 22} w={92} h={44} className={styles.plotText}>
        {built ? BUILDINGS[built.type].name : <RichText text={text} />}
      </Html>
    </g>
  );
}

function CitadelStar({ region, obs }: { region: RegionId; obs: Observation }) {
  const c = STAR_AT[region];
  const citadel = obs.buildings.find((b) => b.type === 'citadel' && b.region === region);
  const visitors = obs.workers.filter(
    (w) => w.position.kind === 'citadelSpot' && w.position.region === region,
  );
  return (
    <g>
      <polygon
        points={starPts(c, 68)}
        fill={citadel ? PLAYER_COLORS[citadel.owner] : 'url(#m-gold)'}
        stroke="#f3dc9a"
        strokeWidth={2}
        filter="url(#m-glow)"
      />
      <Html x={c[0] - 24} y={c[1] - 20} w={48} h={44} className={styles.center}>
        <Icon name={citadel ? 'citadel' : 'citadelOpen'} size={36} />
      </Html>
      {visitors.map((w, i) => (
        <Token key={w.id} w={w} cx={c[0] - 30 + i * 30} cy={c[1] + 84} r={20} />
      ))}
    </g>
  );
}

/** Макет поля-карты по наброску автора. */
export function MapBoard({ obs }: { obs: Observation }) {
  const hospital = obs.workers.filter((w) => w.position.kind === 'hospital');
  const [hx, hy] = HOSPITAL_AT;
  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${MAP.width} ${MAP.height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <Defs />
      <Terrain />
      {REGION_ORDER.map((r) => (
        <CitadelStar key={r} region={r} obs={obs} />
      ))}
      {PLOTS.map((p) => (
        <PlotCircle key={p.id} id={p.id} obs={obs} />
      ))}
      {LOCATION_ORDER.map((l) => (
        <Plaque key={l} id={l} obs={obs} />
      ))}

      {/* Вход в Город у нижних ворот. */}
      <g filter="url(#m-shadow)">
        <rect
          x={ENTRY_AT[0] - 10}
          y={ENTRY_AT[1] - 30}
          width={190}
          height={60}
          rx={30}
          fill="url(#m-plaque)"
          stroke={GOLD}
          strokeWidth={2}
        />
      </g>
      <Html x={ENTRY_AT[0] - 10} y={ENTRY_AT[1] - 30} w={190} h={60} className={styles.entry}>
        <Icon name="cityEntry" size={28} /> <EntryPrice view={obs} size={24} />
      </Html>

      {/* Копилка Логова. */}
      <Html
        x={LOC.lair[0] - 90}
        y={LOC.lair[1] + OVAL.ry + 4}
        w={180}
        h={34}
        className={styles.note}
      >
        копилка: <RichText text={`${obs.lair.stash} руд`} />
      </Html>

      {/* Госпиталь — часовня у реки. */}
      <g filter="url(#m-shadow)">
        <path
          d={`M ${hx - 120} ${hy + 60} L ${hx - 120} ${hy - 20} L ${hx} ${hy - 90} L ${hx + 120} ${hy - 20} L ${hx + 120} ${hy + 60} Z`}
          fill="url(#m-plaque)"
          stroke={GOLD}
          strokeWidth={3}
        />
      </g>
      <text x={hx} y={hy - 12} textAnchor="middle" className={styles.hospital}>
        Госпиталь
      </text>
      <Html x={hx - 110} y={hy} w={220} h={30} className={styles.note}>
        <RichText text="содержание −1 кр" />
      </Html>
      {hospital.map((w, i) => (
        <Token key={w.id} w={w} cx={hx - 70 + (i % 4) * 46} cy={hy + 100} r={20} />
      ))}

      <rect width={MAP.width} height={MAP.height} fill="url(#m-vignette)" pointerEvents="none" />
    </svg>
  );
}
