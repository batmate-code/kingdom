import { plotSurcharge, type Action, type Observation, type Worker } from '@vampire/core';
import {
  BUILDINGS,
  CHARACTERS,
  PROFESSIONS,
  LOCATIONS,
  LOCATION_ORDER,
  PLOT_SURCHARGE_CHOICES,
  PLOTS,
  PRESTIGE_TRACK,
  REGION_ORDER,
  MONUMENT_SLOTS,
  REVERSE_TRACK,
  TRACKS,
  TRACK_BOOSTS,
  type LocationId,
  type RegionId,
  type Resources,
} from '@vampire/data';
import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { PLAYER_COLORS } from '../players';
import { slotLines } from '../slotLines';
import { profColor } from '../colors';
import { EntryPrice } from '../EntryPrice';
import { Icon, RichText } from '../Icon';
import { locName, regionName } from '../labels';
import { useHoveredWorker } from '../hover';
import { forgetWorkers, markSeeded, useTokenMotion } from './tokenMotion';
import styles from './BoardSvg.module.css';
import {
  buildingName,
  isReverseView,
  OBELISK_TEXT,
  SPIRE_TEXT,
  undergroundRewardText,
} from '../reverseView';

/** Эксперимент: клетки трека ниже, чтобы поместились отрицательные отметки. */
const REVERSE_CELL_SCALE = 0.75;
/** Треки влияния крупнее остального поля (автор 24.11). */
const TRACK_SCALE = 1.13;
/** Трек влияния: правый край колонки чисел и начало значков отметок (автор 24.11: отступ). */
const TRACK_NUM_RIGHT = 44;
/** Подпись ПО Шпиля: на столько ниже центра звезды. */
const SPIRE_VP_DY = 70;
const TRACK_MARKS_X = 58;
/** Строка силы в бою под треком влияния региона. */
const STATUS_H = 76;
import { CityWall, Ground, HospitalGarden, LandscapeDefs, Scenery, smooth } from './Landscape';
import {
  CARD,
  CITY_DY,
  CITY_ENTRY_BOX,
  HEX_R,
  LOCATION_CENTERS,
  PLOT_CENTERS,
  PRESTIGE_BOX,
  REGION_SHAPES,
  STAR_PAIRS,
  STARS,
  SX,
  TRACK_BOXES,
  VIEW,
  hexPoints,
  points,
} from './geometry';

const GOLD = '#c9a24a';
const REGION_FILL: Record<RegionId | 'hospital', [string, string]> = {
  city: ['#3c3748', '#221f2b'],
  forest: ['#2b4030', '#141f17'],
  valley: ['#55242a', '#260f13'],
  hospital: ['#4a4540', '#2a2623'],
};

/** Треки влияния — в цвет своего региона, чуть ярче заливки региона. */
const TRACK_FILL: Record<RegionId, [string, string]> = {
  city: ['#56506a', '#2c2836'],
  forest: ['#3d6446', '#1a2b1f'],
  valley: ['#7a3038', '#33151a'],
};

const RES_SHORT: Record<keyof Resources, string> = {
  gold: 'зол',
  blood: 'кр',
  ore: 'руд',
  compromat: 'комп',
};

/**
 * Цели хода на поле (блок Ж): гнёзда слотов (`локация:слот`) и участки (id участка или
 * `citadel:регион`) с допустимыми ходами. Клик отдаёт ходы цели наружу: один — сделать сразу,
 * несколько — выбрать в строке решения.
 */
export interface BoardTargets {
  slots: Record<string, Action[]>;
  plots: Record<string, Action[]>;
  /** Подсказка при наведении: что даст ход (предпросмотр). */
  hint(actions: Action[]): string;
  onPick(actions: Action[]): void;
}

/** Последний ход соперника на поле — обводка цветом игрока. */
export interface BoardLastMove {
  player: number;
  slots: string[];
  plots: string[];
}

/** Сила игроков в регионе перед боем (Ж6). */
export type BoardStrengths = Partial<Record<RegionId, { player: number; strength: number }[]>>;

interface BoardCtx {
  targets?: BoardTargets | undefined;
  lastMove?: BoardLastMove | null | undefined;
  strengths?: BoardStrengths | undefined;
  /** Рабочий, за которым сейчас решение (Шпион перед боем), — подсвечен на поле. */
  activeWorker?: string | null;
}

const Ctx = createContext<BoardCtx>({});

/** Подсветка цели: пульсирующее кольцо, клик — ход, наведение — подсказка. */
function TargetMark({ shape, actions }: { shape: ReactNode; actions: Action[] }) {
  const { targets } = useContext(Ctx);
  if (!targets) return null;
  return (
    <g
      className={styles.target}
      onClick={(e) => {
        e.stopPropagation();
        targets.onPick(actions);
      }}
    >
      <title>{targets.hint(actions)}</title>
      {shape}
    </g>
  );
}

/** HTML внутри SVG: масштабируется вместе с полем. */
export function Html({
  x,
  y,
  w,
  h,
  className,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <foreignObject x={x} y={y} width={w} height={h}>
      <div className={className}>{children}</div>
    </foreignObject>
  );
}

/**
 * Фишка рабочего (решение автора Г2): заливка цветом игрока, внутри порядковый номер,
 * снаружи рамка цвета профессии и тень — чтобы отделяться от кольца слота той же профессии.
 */
export function Token({ w, cx, cy, r = 30 }: { w: Worker; cx: number; cy: number; r?: number }) {
  const num = Number(w.id.split('w')[1] ?? 0) + 1;
  // Наведение на карту рабочего на планшете подсвечивает его фишку на поле.
  // Решение сейчас за этим рабочим (Шпион перед боем) — тоже подсветка (автор 24.11).
  const { activeWorker } = useContext(Ctx);
  const hovered = useHoveredWorker((s) => s.id === w.id) || activeWorker === w.id;
  // Движение фишки с прежнего места (из запаса, между слотами, в госпиталь).
  const ref = useRef<SVGGElement>(null);
  useTokenMotion(ref, w);
  return (
    <g ref={ref} filter="url(#tokenShadow)">
      {hovered && (
        <circle
          cx={cx}
          cy={cy}
          r={r + 14}
          fill="none"
          stroke="#ffe9a8"
          strokeWidth={6}
          className={styles.tokenHover}
        />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={PLAYER_COLORS[w.owner]}
        stroke={w.profession ? profColor(w.profession) : '#2a2228'}
        strokeWidth={6}
      />
      <circle cx={cx} cy={cy} r={r + 3.5} fill="none" stroke="#0d090c" strokeWidth={1.5} />
      <text
        x={cx}
        y={cy + r * 0.36}
        className={styles.tokenNum}
        textAnchor="middle"
        fontSize={r * 1.05}
      >
        {num}
      </text>
    </g>
  );
}

/** Маркер игрока на треке: кружок цвета игрока с номером игрока (Д1). */
function PlayerMarker({
  player,
  cx,
  cy,
  r = 13,
}: {
  player: number;
  cx: number;
  cy: number;
  r?: number;
}) {
  return (
    <g filter="url(#tokenShadow)">
      <circle cx={cx} cy={cy} r={r} fill={PLAYER_COLORS[player]} stroke="#0d090c" strokeWidth={2} />
      <text
        x={cx}
        y={cy + r * 0.38}
        textAnchor="middle"
        className={styles.tokenNum}
        fontSize={r * 1.1}
      >
        {player + 1}
      </text>
    </g>
  );
}

function LocationCard({
  id,
  obs,
  onHover,
}: {
  id: LocationId;
  obs: Observation;
  onHover?: (h: Hovered | null) => void;
}) {
  const [cx, cy] = LOCATION_CENTERS[id];
  const x = cx - CARD.width / 2;
  const y = cy - CARD.height / 2;
  const loc = obs.locations[id];
  const token = loc.professionToken;
  const blocked = obs.blocks.some((b) => b.location === id);
  const def = LOCATIONS[id];
  // Центры гнёзд слотов внутри карточки (совпадают с вёрсткой .slot в CSS).
  const sockets: [[number, number], [number, number]] = [
    [x + 60, y + 107],
    [x + 60, y + 222],
  ];
  return (
    <g
      onMouseEnter={() => onHover?.({ kind: 'location', id })}
      onMouseLeave={() => onHover?.(null)}
    >
      {id === 'tavern' && (
        // Пул Таверны (оставшиеся после драфта карты) — подсказкой при наведении.
        <title>
          {`Пул Таверны:
Персонажи: ${obs.offer.characters.map((c) => CHARACTERS[c].name).join(', ') || '—'}
Профессии: ${obs.offer.professions.map((p) => PROFESSIONS[p].name).join(', ') || '—'}`}
        </title>
      )}
      <rect
        x={x}
        y={y}
        width={CARD.width}
        height={CARD.height}
        rx={14}
        fill="url(#cardFill)"
        stroke={GOLD}
        strokeWidth={2.5}
        filter="url(#cardShadow)"
      />
      <rect
        x={x + 6}
        y={y + 6}
        width={CARD.width - 12}
        height={CARD.height - 12}
        rx={10}
        fill="none"
        stroke={GOLD}
        strokeOpacity={0.35}
      />
      <Html x={x} y={y} w={CARD.width} h={CARD.height} className={styles.card}>
        <div className={styles.cardTitle}>
          {locName(id)}
          {blocked && <span className={styles.lock}>🔒</span>}
        </div>
        {def.slots.map((action, i) => (
          <div key={i} className={styles.slot}>
            <div className={styles.socketSpace} />
            <div className={styles.slotText}>
              {slotLines(action, obs).map((line, j) => (
                <div key={j}>
                  <RichText text={line} />
                </div>
              ))}
              {action.kind === 'lairStash' && (
                <div className={styles.stashLine}>
                  копилка: <RichText text={`${obs.lair.stash} руд`} />
                </div>
              )}
            </div>
          </div>
        ))}
      </Html>
      {/* Гнёзда слотов: второй — с цветом жетона профессии. */}
      {sockets.map(([sx, sy], i) => (
        <g key={i}>
          <circle cx={sx} cy={sy} r={34} fill="url(#socket)" stroke={GOLD} strokeWidth={2} />
          {i === 1 && token && (
            <circle
              cx={sx}
              cy={sy}
              r={39}
              fill="none"
              stroke={profColor(token)}
              strokeWidth={6}
              strokeOpacity={0.9}
            />
          )}
          {i === 1 && loc.slot2Locked && (
            <text x={sx} y={sy + 10} textAnchor="middle" className={styles.lockGlyph}>
              ✕
            </text>
          )}
        </g>
      ))}
      <path
        d={`M ${sockets[1][0] - 40} ${sockets[1][1] - 10} Q ${sockets[0][0] - 58} ${(sockets[0][1] + sockets[1][1]) / 2} ${sockets[0][0] - 34} ${sockets[0][1] + 14}`}
        fill="none"
        stroke={GOLD}
        strokeOpacity={0.9}
        strokeWidth={4}
        markerEnd="url(#arrow)"
      />
      {obs.workers
        .filter((w) => w.position.kind === 'slot' && w.position.location === id)
        .map((w, i) => {
          const slot = w.position.kind === 'slot' ? w.position.slot : 1;
          const [sx, sy] = sockets[slot - 1]!;
          return <Token key={w.id} w={w} cx={sx + i * 6} cy={sy} />;
        })}
      <SocketMarks id={id} sockets={sockets} />
    </g>
  );
}

/** Последний ход соперника и цели хода на гнёздах карточки. */
function SocketMarks({ id, sockets }: { id: LocationId; sockets: [number, number][] }) {
  const { targets, lastMove } = useContext(Ctx);
  return (
    <>
      {sockets.map(([sx, sy], i) => {
        const key = `${id}:${i + 1}`;
        const last = lastMove?.slots.includes(key);
        const actions = targets?.slots[key];
        return (
          <g key={key}>
            {last && lastMove && (
              <circle
                cx={sx}
                cy={sy}
                r={46}
                fill="none"
                stroke={PLAYER_COLORS[lastMove.player]}
                strokeWidth={5}
                strokeDasharray="10 7"
                className={styles.lastMove}
              />
            )}
            {actions && actions.length > 0 && (
              <TargetMark
                actions={actions}
                shape={
                  <circle
                    cx={sx}
                    cy={sy}
                    r={44}
                    className={styles.targetRing}
                    fill="rgba(255,233,168,0.14)"
                  />
                }
              />
            )}
          </g>
        );
      })}
    </>
  );
}

/**
 * Сила игроков перед боем, жетоны силы и жетон Комиссариата — строкой внизу колонки трека
 * влияния региона (автор 24.11: над звездой плашка налезала на локации).
 */
function RegionStatus({
  region,
  obs,
  x,
  y,
  w,
}: {
  region: RegionId;
  obs: Observation;
  x: number;
  y: number;
  w: number;
}) {
  const { strengths } = useContext(Ctx);
  const rows = strengths?.[region] ?? [];
  const power = obs.powerTokens.filter((t) => t.region === region && t.count > 0);
  const commissar = obs.commissariat?.region === region ? obs.commissariat.owner : null;
  if (rows.length === 0 && power.length === 0 && commissar === null) return null;
  return (
    <Html x={x} y={y} w={w} h={STATUS_H} className={styles.statusWrap}>
      <div className={styles.status}>
        {rows.map((r) => (
          <span
            key={`s${r.player}`}
            className={styles.statusPill}
            style={{ background: PLAYER_COLORS[r.player] }}
            title={`Сила Игрока ${r.player + 1} в регионе`}
          >
            ⚔ {r.strength}
          </span>
        ))}
        {power.map((t) => (
          <span
            key={`p${t.owner}`}
            className={styles.statusPill}
            style={{ borderColor: PLAYER_COLORS[t.owner] }}
            title={`Жетоны силы Игрока ${t.owner + 1}`}
          >
            +{t.count}
          </span>
        ))}
        {commissar !== null && (
          <span
            className={styles.statusPill}
            style={{ borderColor: PLAYER_COLORS[commissar] }}
            title={`Жетон Комиссариата у Игрока ${commissar + 1}: госпиталь бьётся здесь`}
          >
            Комис.
          </span>
        )}
      </div>
    </Html>
  );
}

/** Последний ход соперника и цель хода на участке / месте Цитадели. */
function PlotMarks({ id, c, r }: { id: string; c: readonly [number, number]; r: number }) {
  const { targets, lastMove } = useContext(Ctx);
  const actions = targets?.plots[id];
  return (
    <>
      {lastMove?.plots.includes(id) && (
        <polygon
          points={hexPoints(c, r + 12)}
          fill="none"
          stroke={PLAYER_COLORS[lastMove.player]}
          strokeWidth={5}
          strokeDasharray="10 7"
          className={styles.lastMove}
        />
      )}
      {actions && actions.length > 0 && (
        <TargetMark
          actions={actions}
          shape={
            <polygon
              points={hexPoints(c, r + 10)}
              className={styles.targetRing}
              fill="rgba(255,233,168,0.14)"
            />
          }
        />
      )}
    </>
  );
}

/** Силуэты зданий для построенных участков (В3). */
export function BuildingGlyph({
  type,
  cx,
  cy,
  ink = '#1b1418',
  detail: light = 'rgba(255,255,255,.55)',
}: {
  type: string;
  cx: number;
  cy: number;
  /** Цвет силуэта и деталей (на планшете — светлый силуэт, автор 24.11). */
  ink?: string;
  detail?: string;
}) {
  if (type === 'crypt')
    return (
      <g transform={`translate(${cx} ${cy})`} fill={ink}>
        <path d="M -14 16 L -14 -6 A 14 14 0 0 1 14 -6 L 14 16 Z" />
        <path
          d="M -2 -14 L 2 -14 L 2 -9 L 7 -9 L 7 -5 L 2 -5 L 2 8 L -2 8 L -2 -5 L -7 -5 L -7 -9 L -2 -9 Z"
          fill={light}
        />
      </g>
    );
  if (type === 'abbey')
    return (
      <g transform={`translate(${cx} ${cy})`} fill={ink}>
        <path d="M -20 16 L -20 -2 L -8 -12 L -8 -22 L 0 -30 L 8 -22 L 8 -12 L 20 -2 L 20 16 Z" />
        <rect x={-4} y={4} width={8} height={12} rx={4} fill={light} />
      </g>
    );
  return (
    <g transform={`translate(${cx} ${cy})`} fill={ink}>
      <path d="M -22 -6 L -16 -20 L 16 -20 L 22 -6 Z" />
      <rect x={-18} y={-6} width={36} height={22} />
      <circle cx={0} cy={5} r={6} fill={light} />
    </g>
  );
}

function Plot({
  id,
  obs,
  onHover,
}: {
  id: string;
  obs: Observation;
  onHover?: (h: Hovered | null) => void;
}) {
  const c = PLOT_CENTERS[id];
  const plot = PLOTS.find((p) => p.id === id);
  if (!c || !plot) return null;
  const built = obs.buildings.find((b) => b.plot === id);
  // Доплата — только значок ресурса (решение автора В2: «+1» читалось как награда).
  // Доплата на выбор (2 золота/крови в любом соотношении) — «2» и оба значка.
  const surcharge: [keyof Resources, number | null][] = PLOT_SURCHARGE_CHOICES[id]
    ? [
        ['gold', null],
        ['blood', null],
      ]
    : (Object.entries(plotSurcharge(obs, id)) as [keyof Resources, number][]);
  const choiceTotal = PLOT_SURCHARGE_CHOICES[id]?.[0]
    ? Object.values(PLOT_SURCHARGE_CHOICES[id][0]).reduce((a, b) => a + (b ?? 0), 0)
    : null;
  return (
    <g onMouseEnter={() => onHover?.({ kind: 'plot', id })} onMouseLeave={() => onHover?.(null)}>
      <polygon
        points={hexPoints(c, HEX_R)}
        fill={built ? PLAYER_COLORS[built.owner] : 'url(#hexFill)'}
        stroke={GOLD}
        strokeWidth={2.5}
        filter="url(#cardShadow)"
      />
      <polygon
        points={hexPoints(c, HEX_R - 8)}
        fill="none"
        stroke={built ? 'rgba(0,0,0,.35)' : GOLD}
        strokeOpacity={0.35}
      />
      {built ? (
        <>
          <BuildingGlyph type={built.type} cx={c[0]} cy={c[1] - 12} />
          <Html x={c[0] - 56} y={c[1] + 8} w={112} h={26} className={styles.hexText}>
            <span className={styles.builtName}>{BUILDINGS[built.type].name}</span>
          </Html>
        </>
      ) : (
        surcharge.length > 0 && (
          <Html
            x={c[0] - (choiceTotal !== null ? 70 : 40)}
            y={c[1] - 24}
            w={choiceTotal !== null ? 140 : 80}
            h={48}
            className={styles.hexText}
          >
            {choiceTotal !== null && choiceTotal}
            {surcharge.map(([k, v], n) => (
              <Fragment key={k}>
                {choiceTotal !== null && n > 0 && <span className={styles.slash}>/</span>}
                <span
                  key={k}
                  className={styles.surcharge}
                  title={
                    choiceTotal !== null
                      ? `Доплата за двойной участок: ${choiceTotal} золота/крови в любом соотношении`
                      : 'Доплата за двойной участок'
                  }
                >
                  {v !== null && v > 1 && v}
                  <Icon name={k} size={34} />
                </span>
              </Fragment>
            ))}
          </Html>
        )
      )}
      <PlotMarks id={id} c={c} r={HEX_R} />
    </g>
  );
}

function Star({ region, obs }: { region: RegionId; obs: Observation }) {
  const c = STARS[region];
  const reverse = isReverseView(obs);
  // Здания на звезде: Цитадель (в эксперименте — Шпиль) или Обелиск (только в эксперименте).
  const built = obs.buildings.filter(
    (b) => (b.type === 'citadel' || b.type === 'obelisk') && b.region === region,
  );
  // Автор 24.11: при 3–4 игроках на звезде два места под Шпиль и Обелиск.
  const slots =
    reverse && obs.players.length >= MONUMENT_SLOTS.manyFromPlayers
      ? MONUMENT_SLOTS.many
      : MONUMENT_SLOTS.base;
  const visitors = obs.workers.filter(
    (w) => w.position.kind === 'citadelSpot' && w.position.region === region,
  );
  // Б1: яркое место — только если смотрящему игроку хватает влияния на Цитадель здесь
  // (в эксперименте — или он на нижней отметке и может строить Обелиск).
  const inf = obs.players[obs.viewer]?.influence[region] ?? 0;
  const free = built.length < slots;
  const obeliskReady = reverse && free && inf <= REVERSE_TRACK.min;
  const ready = (free && inf >= TRACKS[region].citadelAt) || obeliskReady;
  const spireVp = built
    .filter((b) => reverse && b.type === 'citadel')
    .reduce((sum, b) => sum + (obs.players[b.owner]?.bonusVp ?? 0), 0);
  const pair = STAR_PAIRS[region];
  const r = slots > 1 ? pair.r : 76;
  const centers: (readonly [number, number])[] =
    slots > 1
      ? [
          [c[0] - pair.dx, c[1] + pair.shiftY - pair.dy],
          [c[0] + pair.dx, c[1] + pair.shiftY + pair.dy],
        ]
      : [c];
  // Низ звезды: под ним — ПО Шпилей и рабочие у звезды.
  const bottom = slots > 1 ? c[1] + pair.shiftY + pair.dy + r : c[1] + 76;
  // Цель стройки (подсветка) — первое свободное место.
  const firstFree = built.length;
  return (
    <g>
      {centers.map((center, i) => (
        <StarSlot
          key={i}
          c={center}
          r={r}
          reverse={reverse}
          building={built[i] ?? null}
          ready={i === firstFree && ready}
          obeliskReady={i === firstFree && obeliskReady}
          markId={i === firstFree || (firstFree >= slots && i === 0) ? `citadel:${region}` : null}
          region={region}
          obs={obs}
        />
      ))}
      {/* ПО, которые принесли Шпили за партию, — по центру под звездой. */}
      {spireVp > 0 && (
        <Html
          x={c[0] - 50}
          y={slots > 1 ? bottom : c[1] + SPIRE_VP_DY}
          w={100}
          h={36}
          className={styles.spireVp}
        >
          +{spireVp}
          <Icon name="vp" size={22} />
        </Html>
      )}
      {visitors.map((w, i) => (
        <Token
          key={w.id}
          w={w}
          cx={c[0] - 40 + i * 40}
          cy={bottom + (spireVp > 0 ? 54 : 24)}
          r={24}
        />
      ))}
    </g>
  );
}

function StarSlot({
  c,
  r,
  reverse,
  building,
  ready,
  obeliskReady,
  markId,
  region,
  obs,
}: {
  c: readonly [number, number];
  r: number;
  reverse: boolean;
  building: Observation['buildings'][number] | null;
  ready: boolean;
  obeliskReady: boolean;
  markId: string | null;
  region: RegionId;
  obs: Observation;
}) {
  const lit = ready || building !== null;
  const hint = !reverse
    ? null
    : building
      ? `${buildingName(obs, building.type)} игрока ${building.owner + 1}: ${building.type === 'citadel' ? SPIRE_TEXT : OBELISK_TEXT}`
      : `Место для Шпиля (влияние +${TRACKS[region].citadelAt}) или Обелиска (влияние ${REVERSE_TRACK.min}) — кто построит первым`;
  const icon = r * 1.03;
  return (
    <g>
      {hint && <title>{hint}</title>}
      <polygon
        points={hexPoints(c, r)}
        fill={building ? PLAYER_COLORS[building.owner] : ready ? 'url(#goldFill)' : '#2e2618'}
        stroke={ready ? '#ffe9a8' : GOLD}
        strokeOpacity={lit ? 1 : 0.55}
        strokeWidth={3}
        filter={ready ? 'url(#glow)' : 'url(#cardShadow)'}
      />
      <polygon
        points={hexPoints(c, r * 0.82)}
        fill="none"
        stroke={building ? 'rgba(0,0,0,.4)' : ready ? '#7d5f22' : GOLD}
        strokeOpacity={lit ? 1 : 0.35}
        strokeWidth={2.5}
      />
      <Html
        x={c[0] - icon * 0.65}
        y={c[1] - icon * 0.62}
        w={icon * 1.3}
        h={icon * 1.25}
        className={lit ? styles.starIcon : `${styles.starIcon} ${styles.dim}`}
      >
        <Icon
          name={
            building?.type === 'obelisk'
              ? 'obelisk'
              : !building && obeliskReady
                ? 'obeliskOpen'
                : building
                  ? reverse
                    ? 'spire'
                    : 'citadel'
                  : reverse
                    ? 'spireOpen'
                    : 'citadelOpen'
          }
          size={Math.round(icon)}
        />
      </Html>
      {markId && <PlotMarks id={markId} c={c} r={r} />}
    </g>
  );
}

function InfluenceTrack({ region, obs }: { region: RegionId; obs: Observation }) {
  const base = TRACK_BOXES[region];
  const track = TRACKS[region];
  // Эксперимент: трек уходит в минус, клетки ниже, чтобы колонка поместилась на поле.
  const reverse = isReverseView(obs);
  const min = reverse ? REVERSE_TRACK.min : 0;
  const box = reverse ? { ...base, cell: Math.round(base.cell * REVERSE_CELL_SCALE) } : base;
  const values = Array.from({ length: track.max - min + 1 }, (_, i) => track.max - i);
  const boosts = TRACK_BOOSTS[region];
  // Автор 24.11: треки крупнее (TRACK_SCALE) — масштаб от левого верхнего угла колонки.
  return (
    <g
      transform={`translate(${box.x} ${box.y}) scale(${TRACK_SCALE}) translate(${-box.x} ${-box.y})`}
    >
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.cell * values.length + 44 + STATUS_H}
        rx={10}
        fill={`url(#track-${region})`}
        stroke={GOLD}
        strokeWidth={2}
        filter="url(#cardShadow)"
      />
      <text x={box.x + box.w / 2} y={box.y + 32} textAnchor="middle" className={styles.trackTitle}>
        {regionName(region)}
      </text>
      {values.map((v, i) => {
        const y = box.y + 44 + i * box.cell;
        const marks: ReactNode[] = [];
        if (track.vpMarks.includes(v)) marks.push(<Icon key="vp" name="vp" size={28} />);
        // Жетон первенства — на вершине трека: золотой, пока не взят; затем цвета игрока.
        if (v === track.max) {
          const first = obs.firstToMax[region];
          marks.push(
            <span
              key="first"
              className={styles.firstBadge}
              style={first !== undefined ? { background: PLAYER_COLORS[first] } : {}}
              title={
                first !== undefined
                  ? `Жетон первенства: Игрок ${first + 1}`
                  : 'Жетон первенства: первому, кто дойдёт сюда (+1 ПО)'
              }
            >
              1<Icon name="vp" size={16} />
            </span>,
          );
        }
        if (v === track.citadelAt) {
          marks.push(<Icon key="c" name={reverse ? 'spireOpen' : 'citadelOpen'} size={28} />);
        }
        if (v === track.cityEntryRaiseAt)
          marks.push(<Icon key="e" name="cityEntryRaise" size={28} />);
        // Отметки снизу (эксперимент): награда и точки игроков, которые её уже взяли.
        const mark = reverse ? REVERSE_TRACK.marks.find((m) => m.at === v) : undefined;
        if (mark) {
          const r = mark.reward;
          marks.push(
            <span key="u" className={styles.boost} title={undergroundRewardText(v)}>
              {r.kind === 'ore' && <RichText text={`+${r.ore} руд`} />}
              {r.kind === 'buildRight' && <Icon name="build" size={24} />}
              {r.kind === 'strength' && (
                <>
                  +{r.strength}
                  <Icon name="strengthToken" size={22} />
                </>
              )}
              {r.kind === 'obelisk' && <Icon name="obeliskOpen" size={28} />}
            </span>,
          );
          obs.players.forEach((p, pi) => {
            if (p.trackBoostsTaken.includes(`${region}-${v}`)) {
              marks.push(
                <span
                  key={`t${pi}`}
                  className={styles.takenDot}
                  style={{ background: PLAYER_COLORS[pi] }}
                  title={`Игрок ${pi + 1} уже получил эту награду`}
                />,
              );
            }
          });
        }
        for (const b of boosts.filter((x) => x.at === v)) {
          const [k, n] = Object.entries(b.gain)[0]!;
          marks.push(
            <span key={`b${k}`} className={styles.boost}>
              <RichText text={`+${n} ${RES_SHORT[k as keyof Resources]}`} />
            </span>,
          );
        }
        const here = obs.players.flatMap((p, pi) => (p.influence[region] === v ? [pi] : []));
        return (
          <g key={v}>
            {v < 0 && (
              <rect
                x={box.x + 4}
                y={y}
                width={box.w - 8}
                height={box.cell}
                fill="#2a1638"
                fillOpacity={0.75}
              />
            )}
            <line
              x1={box.x + 8}
              x2={box.x + box.w - 8}
              y1={y}
              y2={y}
              stroke={GOLD}
              // Автор 24.11: деления ярче, чтобы трек не сливался в одну полосу.
              strokeOpacity={0.5}
              strokeWidth={1.5}
            />
            {/* Число — в своей колонке (выравнено вправо), значки отметки — после отступа. */}
            <text
              x={box.x + TRACK_NUM_RIGHT}
              y={y + box.cell / 2 + 9}
              textAnchor="end"
              className={styles.trackNum}
            >
              {v < 0 ? `−${-v}` : v}
            </text>
            <Html
              x={box.x + TRACK_MARKS_X}
              y={y + 4}
              w={box.w - TRACK_MARKS_X - 26 * Math.max(1, here.length)}
              h={box.cell - 8}
              className={styles.marks}
            >
              {marks}
            </Html>
            {here.map((pi, k) => (
              <PlayerMarker
                key={pi}
                player={pi}
                cx={box.x + box.w - 18 - k * 26}
                cy={y + box.cell / 2}
              />
            ))}
          </g>
        );
      })}
      {/* Строка силы в бою: тёмный блок, отделённый от трека линией (автор 24.11). */}
      <rect
        x={box.x + 4}
        y={box.y + 44 + box.cell * values.length}
        width={box.w - 8}
        height={STATUS_H - 6}
        rx={6}
        fill="#0e0a10"
        fillOpacity={0.9}
      />
      <line
        x1={box.x + 4}
        x2={box.x + box.w - 4}
        y1={box.y + 44 + box.cell * values.length}
        y2={box.y + 44 + box.cell * values.length}
        stroke={GOLD}
        strokeWidth={2.5}
      />
      <RegionStatus
        region={region}
        obs={obs}
        x={box.x + 4}
        y={box.y + 44 + box.cell * values.length}
        w={box.w - 8}
      />
    </g>
  );
}

function PrestigeTrack({ obs }: { obs: Observation }) {
  const n = PRESTIGE_TRACK.max + 1;
  const cell = PRESTIGE_BOX.w / n;
  return (
    <g>
      <rect
        x={PRESTIGE_BOX.x - 60}
        y={PRESTIGE_BOX.y}
        width={PRESTIGE_BOX.w + 60}
        height={PRESTIGE_BOX.h}
        rx={10}
        fill="url(#trackFill)"
        stroke={GOLD}
        strokeWidth={2}
      />
      <Html x={PRESTIGE_BOX.x - 54} y={PRESTIGE_BOX.y + 26} w={48} h={48} className={styles.marks}>
        <Icon name="prestige" size={40} />
      </Html>
      {Array.from({ length: n }, (_, v) => {
        const x = PRESTIGE_BOX.x + v * cell;
        const mark = (PRESTIGE_TRACK.vpMarks as readonly number[]).includes(v);
        const here = obs.players.flatMap((p, pi) =>
          Math.min(p.prestige, PRESTIGE_TRACK.max) === v ? [pi] : [],
        );
        return (
          <g key={v}>
            <line
              x1={x}
              x2={x}
              y1={PRESTIGE_BOX.y + 8}
              y2={PRESTIGE_BOX.y + PRESTIGE_BOX.h - 8}
              stroke={GOLD}
              strokeOpacity={0.18}
            />
            {mark && (
              <rect
                x={x + 2}
                y={PRESTIGE_BOX.y + 6}
                width={cell - 4}
                height={PRESTIGE_BOX.h - 12}
                rx={6}
                fill={GOLD}
                fillOpacity={0.18}
              />
            )}
            <text
              x={x + cell / 2}
              y={PRESTIGE_BOX.y + 38}
              textAnchor="middle"
              className={mark ? styles.prestigeMark : styles.prestigeNum}
            >
              {v}
            </text>
            {here.map((pi, k) => (
              <PlayerMarker
                key={pi}
                player={pi}
                cx={x + cell / 2 + (k - (here.length - 1) / 2) * 19}
                cy={PRESTIGE_BOX.y + 72}
                r={11}
              />
            ))}
          </g>
        );
      })}
    </g>
  );
}

/** Что под курсором: карточка локации или участок под здание. */
type Hovered = { kind: 'location'; id: LocationId } | { kind: 'plot'; id: string };

/** Лупа: карточка локации (×1,7) или участок (×2,4) под курсором крупнее, не выходя за край поля. */
const MAGNIFY = { location: 1.7, plot: 2.4 } as const;

function Magnified({ hovered, obs }: { hovered: Hovered; obs: Observation }) {
  const k = MAGNIFY[hovered.kind];
  const center =
    hovered.kind === 'location' ? LOCATION_CENTERS[hovered.id] : PLOT_CENTERS[hovered.id];
  if (!center) return null;
  const [cx, cy] = center;
  const ownW = hovered.kind === 'location' ? CARD.width / 2 : HEX_R;
  const halfW = (hovered.kind === 'location' ? CARD.width / 2 : HEX_R) * k + 12;
  const halfH = (hovered.kind === 'location' ? CARD.height / 2 : HEX_R) * k + 12;
  // Сбоку от объекта: справа, если помещается, иначе слева — не закрывает гнёзда под курсором.
  const right = cx + ownW + 16 + halfW;
  const x = right + halfW <= VIEW.width ? right : cx - ownW - 16 - halfW;
  const y = Math.min(Math.max(cy, halfH), VIEW.height - halfH);
  return (
    <g
      data-no-motion
      pointerEvents="none"
      transform={`translate(${x} ${y}) scale(${k}) translate(${-cx} ${-cy})`}
      filter="url(#cardShadow)"
    >
      {hovered.kind === 'location' ? (
        <LocationCard id={hovered.id} obs={obs} />
      ) : (
        <Plot id={hovered.id} obs={obs} />
      )}
    </g>
  );
}

/**
 * Поле целиком: один SVG, масштабируется под контейнер.
 * landscape — пейзаж под схемой (горы, лес, река, стена Города), макет ?mock=mix.
 */
export function BoardSvg({
  obs,
  landscape = false,
  targets,
  lastMove,
  strengths,
}: {
  obs: Observation;
  landscape?: boolean;
  targets?: BoardTargets | undefined;
  lastMove?: BoardLastMove | null | undefined;
  strengths?: BoardStrengths | undefined;
}) {
  const hospital = obs.workers.filter((w) => w.position.kind === 'hospital');
  // Фишки в запасе с поля пропадают: следующее появление — выход из запаса (правый край поля).
  forgetWorkers(obs.workers.filter((w) => w.position.kind === 'reserve').map((w) => w.id));
  useEffect(() => markSeeded(), []);
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const hc = landscape
    ? ([1000 * SX, 1515 + CITY_DY] as const)
    : ([995 * SX, 1470 + CITY_DY] as const);
  return (
    <Ctx.Provider
      value={{
        targets,
        lastMove,
        strengths,
        // Решение за этим рабочим: Шпион перед боем, Палач при размещении.
        activeWorker:
          obs.pending?.kind === 'spyMove' || obs.pending?.kind === 'executioner'
            ? obs.pending.workerId
            : null,
      }}
    >
      <svg
        data-board
        className={styles.svg}
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {landscape && <LandscapeDefs />}
          {/* Фактура ткани: мелкое зерно + крупные пятна. */}
          <filter id="cloth" x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="2"
              seed="3"
              result="fine"
            />
            <feColorMatrix in="fine" type="saturate" values="0" result="fineG" />
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.012"
              numOctaves="3"
              seed="8"
              result="big"
            />
            <feColorMatrix in="big" type="saturate" values="0" result="bigG" />
            <feBlend in="fineG" in2="bigG" mode="multiply" result="noise" />
            <feComposite in="noise" in2="SourceGraphic" operator="in" result="clipped" />
            <feBlend in="SourceGraphic" in2="clipped" mode="multiply" result="tex" />
            <feComposite in="tex" in2="SourceGraphic" operator="in" />
          </filter>
          <filter id="regionEdge" x="-5%" y="-5%" width="110%" height="110%">
            <feDropShadow dx="0" dy="8" stdDeviation="14" floodColor="#000" floodOpacity="0.75" />
          </filter>
          <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="6" stdDeviation="7" floodColor="#000" floodOpacity="0.7" />
          </filter>
          <filter id="tokenShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#000" floodOpacity="0.95" />
          </filter>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="vignette" cx="50%" cy="45%" r="75%">
            <stop offset="55%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.75" />
          </radialGradient>
          {(Object.keys(REGION_FILL) as (keyof typeof REGION_FILL)[]).map((r) => (
            <radialGradient key={r} id={`fill-${r}`} cx="45%" cy="40%" r="75%">
              <stop offset="0%" stopColor={REGION_FILL[r][0]} />
              <stop offset="100%" stopColor={REGION_FILL[r][1]} />
            </radialGradient>
          ))}
          <linearGradient id="cardFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2a2228" />
            <stop offset="100%" stopColor="#17121a" />
          </linearGradient>
          {(['city', 'forest', 'valley'] as const).map((r) => (
            <linearGradient key={r} id={`track-${r}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TRACK_FILL[r][0]} />
              <stop offset="100%" stopColor={TRACK_FILL[r][1]} />
            </linearGradient>
          ))}
          <linearGradient id="trackFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#231c24" />
            <stop offset="100%" stopColor="#141017" />
          </linearGradient>
          <linearGradient id="hexFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a3038" />
            <stop offset="100%" stopColor="#1c161d" />
          </linearGradient>
          <linearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f4dc93" />
            <stop offset="55%" stopColor="#c9a24a" />
            <stop offset="100%" stopColor="#7d5f22" />
          </linearGradient>
          <radialGradient id="socket" cx="50%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#5a4b52" />
            <stop offset="60%" stopColor="#3a2f36" />
            <stop offset="100%" stopColor="#1c151c" />
          </radialGradient>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={GOLD} fillOpacity="0.8" />
          </marker>
          {/* Всё поле — строго в границах viewBox: река и тени не торчат в поля экрана. */}
          <clipPath id="board-clip">
            <rect width={VIEW.width} height={VIEW.height} />
          </clipPath>
        </defs>

        <g clipPath="url(#board-clip)">
          {landscape ? <Ground /> : <rect width={VIEW.width} height={VIEW.height} fill="#0c090e" />}

          {/* Регионы и госпиталь. */}
          {(landscape
            ? (['city', 'forest', 'valley'] as const)
            : (['city', 'forest', 'valley', 'hospital'] as const)
          ).map((r) => (
            <g key={r} filter="url(#regionEdge)">
              {landscape && r !== 'city' ? (
                <>
                  <path
                    d={smooth(REGION_SHAPES[r])}
                    fill={`url(#fill-${r})`}
                    filter="url(#cloth)"
                  />
                  <path
                    d={smooth(REGION_SHAPES[r])}
                    fill="none"
                    stroke={GOLD}
                    strokeOpacity={0.55}
                    strokeWidth={3}
                  />
                </>
              ) : (
                <>
                  <polygon
                    points={points(REGION_SHAPES[r])}
                    fill={`url(#fill-${r})`}
                    filter="url(#cloth)"
                  />
                  {!(landscape && r === 'city') && (
                    <polygon
                      points={points(REGION_SHAPES[r])}
                      fill="none"
                      stroke={GOLD}
                      strokeOpacity={0.55}
                      strokeWidth={3}
                    />
                  )}
                </>
              )}
            </g>
          ))}
          {landscape && (
            <>
              <Scenery />
              <CityWall />
              <HospitalGarden />
            </>
          )}

          {/* Дорожки от локаций к участкам. */}
          {PLOTS.map((p) =>
            p.adjacent.map((l) => {
              const a = PLOT_CENTERS[p.id];
              const b = LOCATION_CENTERS[l];
              if (!a) return null;
              return (
                <g key={`${p.id}-${l}`}>
                  {landscape && (
                    <line
                      x1={a[0]}
                      y1={a[1]}
                      x2={b[0]}
                      y2={b[1]}
                      stroke="#0b0809"
                      strokeOpacity={0.7}
                      strokeWidth={12}
                      strokeLinecap="round"
                    />
                  )}
                  <line
                    x1={a[0]}
                    y1={a[1]}
                    x2={b[0]}
                    y2={b[1]}
                    stroke={GOLD}
                    strokeOpacity={landscape ? 0.85 : 0.4}
                    strokeWidth={landscape ? 4 : 3}
                    strokeDasharray="2 10"
                    strokeLinecap="round"
                  />
                </g>
              );
            }),
          )}

          {REGION_ORDER.map((r) => (
            <Star key={r} region={r} obs={obs} />
          ))}
          {PLOTS.map((p) => (
            <Plot key={p.id} id={p.id} obs={obs} onHover={setHovered} />
          ))}
          {LOCATION_ORDER.map((l) => (
            <LocationCard key={l} id={l} obs={obs} onHover={setHovered} />
          ))}
          {REGION_ORDER.map((r) => (
            <InfluenceTrack key={r} region={r} obs={obs} />
          ))}

          {/* Вход в Город. */}
          <rect
            x={CITY_ENTRY_BOX.x}
            y={CITY_ENTRY_BOX.y}
            width={CITY_ENTRY_BOX.w}
            height={CITY_ENTRY_BOX.h}
            rx={10}
            fill="url(#cardFill)"
            stroke={GOLD}
            strokeWidth={2}
            filter="url(#cardShadow)"
          />
          <Html
            x={CITY_ENTRY_BOX.x}
            y={CITY_ENTRY_BOX.y}
            w={CITY_ENTRY_BOX.w}
            h={CITY_ENTRY_BOX.h}
            className={styles.entry}
          >
            <span className={styles.entryLabel}>Вход</span>
            <Icon name="cityEntry" size={30} /> <EntryPrice view={obs} size={26} />
          </Html>

          {/* Госпиталь. */}
          <text
            x={hc[0]}
            y={(landscape ? 1430 : 1330) + CITY_DY}
            textAnchor="middle"
            className={styles.regionLabel}
            fontSize={landscape ? 26 : undefined}
          >
            Госпиталь
          </text>
          <Html
            x={hc[0] - 115}
            y={(landscape ? 1438 : 1345) + CITY_DY}
            w={230}
            h={36}
            className={styles.stash}
          >
            <RichText text="содержание −1 кр" />
          </Html>
          {hospital.map((w, i) => (
            <Token
              key={w.id}
              w={w}
              cx={hc[0] - 60 + (i % 3) * 60}
              cy={hc[1] + Math.floor(i / 3) * 50}
            />
          ))}

          <PrestigeTrack obs={obs} />
          {hovered && <Magnified hovered={hovered} obs={obs} />}
          <rect
            width={VIEW.width}
            height={VIEW.height}
            fill="url(#vignette)"
            pointerEvents="none"
          />
        </g>
      </svg>
    </Ctx.Provider>
  );
}
