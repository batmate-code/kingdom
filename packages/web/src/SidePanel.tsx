import {
  buildingCost,
  getScores,
  type GameState,
  type Observation,
  type Worker,
} from '@vampire/core';
import {
  BUILDING_EFFECTS,
  BUILDINGS,
  CHARACTERS,
  COMBAT_TOKENS,
  COMBAT_TOKEN_ORDER,
  PROFESSIONS,
  type BuildingId,
} from '@vampire/data';
import { PLAYER_COLORS, Token } from './Board';
import { BuildingGlyph } from './board/BoardSvg';
import { profStyle } from './colors';
import { Icon, RichText } from './Icon';
import { locName, regionName } from './labels';
import { useState } from 'react';
import abbeyImg from './assets/buildings/abbey.png';
import citadelImg from './assets/buildings/citadel.png';
import cryptImg from './assets/buildings/crypt.png';
import shopImg from './assets/buildings/shop.png';
import { cardUrl } from './cards';
import { TOKEN_IMG } from './CombatModal';
import styles from './SidePanel.module.css';

/**
 * Правая колонка экрана партии (по образцу панелей игроков BGA): запас ходящего игрока,
 * компактные карточки всех игроков сразу, свёрнутая справка по зданиям.
 */

/** Силуэты зданий с планшета автора (docs/images/player-board.jpg). */
const BUILDING_IMG: Record<BuildingId, string> = {
  crypt: cryptImg,
  abbey: abbeyImg,
  shop: shopImg,
  citadel: citadelImg,
};

const BUILDING_TYPES = [
  'crypt',
  'abbey',
  'shop',
  'citadel',
] as const satisfies readonly BuildingId[];

const BUILDING_TEXT: Record<BuildingId, string> = {
  crypt: `+${BUILDING_EFFECTS.cryptStrength} к силе в бою региона, если ваш рабочий в соседней локации`,
  abbey: `+${BUILDING_EFFECTS.abbeyBloodPerDisplacement} кр за каждое вытеснение из соседней локации`,
  shop: `+${BUILDING_EFFECTS.shopGoldPerVisit} зол, когда чужой рабочий приходит в соседнюю локацию`,
  citadel: `Лес: +${BUILDING_EFFECTS.forestCitadelStrength} к силе в бою; Долина: содержание −${BUILDING_EFFECTS.valleyCitadelUpkeepDiscount} кр; Город: +${BUILDING_EFFECTS.cityCitadelCompromatPerVisit} комп за чужой визит`,
};

function where(w: Worker): string {
  const p = w.position;
  if (p.kind === 'reserve') return 'в запасе';
  if (p.kind === 'hospital') return 'в госпитале';
  if (p.kind === 'citadelSpot') return regionName(p.region);
  return `${locName(p.location)} · ${p.slot}`;
}

function costText(obs: Observation, type: BuildingId): string {
  const c = buildingCost(obs, type);
  return [c.gold ? `${c.gold} зол` : '', c.ore ? `${c.ore} руд` : ''].filter(Boolean).join(' + ');
}

/** Рабочий строкой: фишка, персонаж, профессия, где стоит. */
function WorkerRow({
  w,
  selected,
  onClick,
}: {
  w: Worker;
  selected?: boolean;
  onClick?: (() => void) | undefined;
}) {
  const ch = w.character ? CHARACTERS[w.character] : null;
  return (
    <div
      className={`${styles.worker} ${onClick ? styles.clickable : ''} ${selected ? styles.selected : ''}`}
      onClick={onClick}
      title={ch ? `${ch.name}: ${ch.text} (содержание ${ch.upkeep})` : 'Рабочий без улучшения'}
    >
      <Token
        w={w}
        {...(selected !== undefined ? { selected } : {})}
        {...(onClick ? { onClick } : {})}
      />
      <span className={styles.workerName}>{ch ? ch.name : 'без улучшения'}</span>
      {w.profession && (
        <span
          className={styles.prof}
          style={profStyle(w.profession)}
          title={`${PROFESSIONS[w.profession].name}: ${PROFESSIONS[w.profession].text}`}
        >
          {PROFESSIONS[w.profession].name}
        </span>
      )}
      <span className={styles.where}>{where(w)}</span>
    </div>
  );
}

/** Запас ходящего человека: выбор рабочего для размещения. */
export function HandPanel({
  obs,
  player,
  active,
  selected,
  onSelect,
}: {
  obs: Observation;
  player: number;
  active: boolean;
  selected: string | null;
  onSelect(id: string | null): void;
}) {
  const reserve = obs.workers.filter((w) => w.owner === player && w.position.kind === 'reserve');
  return (
    <section className={styles.hand}>
      <h4 className={styles.sectionTitle}>Ваш запас</h4>
      {reserve.length === 0 && <div className={styles.muted}>все рабочие на поле</div>}
      {reserve.map((w) => (
        <WorkerRow
          key={w.id}
          w={w}
          selected={selected === w.id}
          onClick={active ? () => onSelect(selected === w.id ? null : w.id) : undefined}
        />
      ))}
      {active && (
        <div className={styles.muted}>
          {selected ? 'Кликните подсвеченное гнездо на поле' : 'Выберите рабочего или сразу гнездо'}
        </div>
      )}
    </section>
  );
}

/** Лупа карты рабочего: крупно слева от панели, на уровне карты (не выходя за экран). */
function CardZoom({ w, rect }: { w: Worker; rect: DOMRect }) {
  const ch = w.character ? CHARACTERS[w.character] : null;
  const src = cardUrl(w.character ?? '_back');
  const width = Math.min(340, Math.max(220, window.innerWidth * 0.16));
  const height = (width * 7) / 5 + (w.profession ? 70 : 0);
  const top = Math.min(
    Math.max(8, rect.top + rect.height / 2 - height / 2),
    window.innerHeight - height - 8,
  );
  const left = Math.max(8, rect.left - width - 16);
  return (
    <div className={styles.zoom} style={{ top, left, width }}>
      {src && <img src={src} alt={ch?.name ?? 'Рубашка'} />}
      {w.profession && (
        <div className={styles.zoomProf} style={profStyle(w.profession)}>
          <b>{PROFESSIONS[w.profession].name}</b>
          <span>{PROFESSIONS[w.profession].text}</span>
        </div>
      )}
    </div>
  );
}

/** Шестиугольник цепочки престижа: заливка цветом игрока, если здание построено. */
function PrestigeHex({ value, filled, color }: { value: number; filled: boolean; color: string }) {
  return (
    <span className={styles.hexBox}>
      <svg viewBox="0 0 52 46" className={styles.hexSvg} aria-hidden>
        <polygon
          points="13,2 39,2 51,23 39,44 13,44 1,23"
          fill={filled ? color : '#1c161d'}
          stroke={filled ? '#0d090c' : '#cfc4b3'}
          strokeWidth={2.5}
        />
      </svg>
      <span className={`${styles.hexVal} ${filled ? styles.hexValOn : ''}`}>
        {value}
        <Icon name="prestige" size={13} />
      </span>
    </span>
  );
}

/**
 * Планшет игрока как на картоне автора: слева цепочки зданий (силуэт, цена, три шестиугольника
 * престижа со стрелками), справа Цитадель, внизу три карты рабочих с номерами. Эффект здания —
 * подсказкой при наведении на строку.
 */
function Planshet({ obs, player }: { obs: Observation; player: number }) {
  const [zoom, setZoom] = useState<{ w: Worker; rect: DOMRect } | null>(null);
  const color = PLAYER_COLORS[player] ?? '#999';
  const own = obs.workers
    .filter((w) => w.owner === player)
    .sort((a, b) => a.id.localeCompare(b.id));
  const builtOf = (type: BuildingId) =>
    obs.buildings.filter((b) => b.owner === player && b.type === type);
  const citadel = builtOf('citadel')[0];
  const p = obs.players[player];
  return (
    <div className={styles.planshet}>
      <div className={styles.chains}>
        {(['crypt', 'abbey', 'shop'] as const).map((type) => {
          const built = builtOf(type).length;
          return (
            <div
              key={type}
              className={styles.chainRow}
              title={`${BUILDINGS[type].name}: ${BUILDING_TEXT[type].replace(/ зол/g, ' золото').replace(/ кр /g, ' крови ')}`}
            >
              <span className={styles.bIcon}>
                <img src={BUILDING_IMG[type]} alt={BUILDINGS[type].name} />
                <span className={styles.bCost}>
                  <RichText text={costText(obs, type)} />
                </span>
              </span>
              {BUILDINGS[type].prestige.map((pr, i) => (
                <span key={i} className={styles.chainStep}>
                  {i > 0 && <span className={styles.arrow}>→</span>}
                  <PrestigeHex value={pr} filled={i < built} color={color} />
                </span>
              ))}
            </div>
          );
        })}
      </div>
      <div className={styles.citadelCol} title={`Цитадель: ${BUILDING_TEXT.citadel}`}>
        <img className={styles.citadelImg} src={BUILDING_IMG.citadel} alt="Цитадель" />
        <span className={styles.bCost}>
          <RichText text={costText(obs, 'citadel')} />
        </span>
        <PrestigeHex value={BUILDINGS.citadel.prestige[0] ?? 0} filled={!!citadel} color={color} />
        {citadel && <span className={styles.citadelWhere}>{regionName(citadel.region)}</span>}
      </div>
      <div className={styles.cards}>
        {own.map((w, i) => {
          const ch = w.character ? CHARACTERS[w.character] : null;
          const src = cardUrl(w.character ?? '_back');
          return (
            <div
              key={w.id}
              className={styles.cardSlot}
              onMouseEnter={(e) => setZoom({ w, rect: e.currentTarget.getBoundingClientRect() })}
              onMouseLeave={() => setZoom(null)}
              title={
                ch
                  ? `${i + 1}. ${ch.name} (содержание ${ch.upkeep}): ${ch.text}${w.profession ? `. Профессия: ${PROFESSIONS[w.profession].name}` : ''}. ${where(w)}`
                  : `${i + 1}. Рабочий без улучшения. ${where(w)}`
              }
            >
              {src ? (
                <img className={styles.cardImg} src={src} alt="" />
              ) : (
                <div className={styles.cardImg} />
              )}
              <span className={styles.cardNum}>
                {i + 1}
                {w.profession && (
                  <span
                    className={styles.prof}
                    style={profStyle(w.profession)}
                    title={`${PROFESSIONS[w.profession].name}: ${PROFESSIONS[w.profession].text}`}
                  >
                    {PROFESSIONS[w.profession].name}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {p && (p.draftPick.character || p.draftPick.profession) && (
        <div className={styles.draftPick}>
          драфт: {p.draftPick.character ? CHARACTERS[p.draftPick.character].name : '—'}
          {p.draftPick.profession && (
            <span
              className={styles.prof}
              style={profStyle(p.draftPick.profession)}
              title={`${PROFESSIONS[p.draftPick.profession].name}: ${PROFESSIONS[p.draftPick.profession].text}`}
            >
              {PROFESSIONS[p.draftPick.profession].name}
            </span>
          )}
        </div>
      )}
      {zoom && <CardZoom w={zoom.w} rect={zoom.rect} />}
    </div>
  );
}

/** Карточка игрока: очки, ресурсы, влияние, рабочие, здания, жетоны боя. */
function PlayerCard({
  obs,
  state,
  player,
  seat,
  isViewer,
}: {
  obs: Observation;
  state: GameState;
  player: number;
  seat: string;
  isViewer: boolean;
}) {
  const p = obs.players[player];
  if (!p) return null;
  const score = getScores(state).find((s) => s.player === player);
  const turn = state.pending?.player === player;
  const color = PLAYER_COLORS[player];
  return (
    <section
      className={`${styles.player} ${turn ? styles.turn : ''}`}
      style={{ borderLeftColor: color, ...(turn ? { boxShadow: `0 0 0 2px ${color}` } : {}) }}
    >
      <header className={styles.head}>
        <span className={styles.dot} style={{ background: color }}>
          {player + 1}
        </span>
        <b className={styles.name}>
          Игрок {player + 1}
          <span className={styles.seat}>
            {isViewer ? ' · вы' : seat !== 'human' ? ' · бот' : ''}
          </span>
        </b>
        {obs.firstPlayer === player && (
          <span className={styles.first} title="Первый игрок в этом раунде">
            первый
          </span>
        )}
        <span className={styles.score} title="Победные очки и престиж">
          {score?.vp ?? 0} <Icon name="vp" size={20} />
          <span className={styles.prestige}>
            {p.prestige} <Icon name="prestige" size={18} />
          </span>
        </span>
      </header>

      <div className={styles.resources}>
        {(['gold', 'blood', 'ore', 'compromat'] as const).map((r) => (
          <span key={r} className={styles.res}>
            <b>{p.resources[r]}</b> <Icon name={r} size={18} />
          </span>
        ))}
      </div>

      <Planshet obs={obs} player={player} />

      <div className={styles.tokens}>
        {/* Жетоны боя: в руке — ярко, потраченные (в сбросе) — тускло и зачёркнуто. */}
        {COMBAT_TOKEN_ORDER.flatMap((t) => {
          const { hand, discard } = p.combatTokens;
          const chip = (n: number, spent: boolean) => (
            <span
              key={`${t}-${spent}`}
              className={`${styles.tokenChip} ${spent ? styles.spent : ''}`}
              title={`${COMBAT_TOKENS[t].name}${spent ? ' — потрачен' : ''}: ${COMBAT_TOKENS[t].text}`}
            >
              <img src={TOKEN_IMG[t]} alt="" />
              {COMBAT_TOKENS[t].name}
              {n > 1 ? ` ×${n}` : ''}
            </span>
          );
          return [
            ...(hand[t] > 0 ? [chip(hand[t], false)] : []),
            ...(discard[t] > 0 ? [chip(discard[t], true)] : []),
          ];
        })}
      </div>
    </section>
  );
}

/** Справка по зданиям: цена, престиж цепочки, эффект. */
function BuildingsRef({ obs }: { obs: Observation }) {
  return (
    <details className={styles.ref}>
      <summary>Здания: цены и эффекты</summary>
      {BUILDING_TYPES.map((type) => (
        <div key={type} className={styles.refRow}>
          <svg viewBox="-24 -32 48 50" width={26} height={26}>
            <BuildingGlyph type={type} cx={0} cy={0} />
          </svg>
          <div>
            <b>{BUILDINGS[type].name}</b>{' '}
            <span className={styles.muted}>
              <RichText text={costText(obs, type)} /> · престиж{' '}
              {BUILDINGS[type].prestige.join(' → ')}
            </span>
            <div className={styles.refText}>
              <RichText text={BUILDING_TEXT[type]} />
            </div>
          </div>
        </div>
      ))}
    </details>
  );
}

/**
 * Игроки вкладками (решение автора: без длинной прокрутки): на вкладке — номер, очки и отметка хода,
 * под вкладками — карточка выбранного игрока; по умолчанию — смотрящий. Справка по зданиям — ниже.
 */
export function PlayersPanel({
  obs,
  state,
  viewer,
  seats,
}: {
  obs: Observation;
  state: GameState;
  viewer: number;
  seats: readonly string[];
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const player = picked ?? viewer;
  const scores = getScores(state);
  return (
    <div className={styles.panel}>
      <div className={styles.tabs} role="tablist">
        {obs.players.map((_, i) => {
          const color = PLAYER_COLORS[i];
          const turn = state.pending?.player === i;
          return (
            <button
              key={i}
              role="tab"
              aria-selected={i === player}
              className={`${styles.tab} ${i === player ? styles.tabActive : ''}`}
              style={{ borderColor: color, ...(i === player ? { background: color } : {}) }}
              onClick={() => setPicked(i === viewer ? null : i)}
              title={`Игрок ${i + 1}${i === viewer ? ' (вы)' : seats[i] !== 'human' ? ' (бот)' : ''}${turn ? ' — сейчас ходит' : ''}`}
            >
              {turn && <span className={styles.turnMark}>▶</span>}
              Игрок {i + 1}
              <span className={styles.tabVp}>
                {scores.find((s) => s.player === i)?.vp ?? 0}
                <Icon name="vp" size={14} />
              </span>
            </button>
          );
        })}
      </div>
      <PlayerCard
        obs={obs}
        state={state}
        player={player}
        seat={seats[player] ?? 'human'}
        isViewer={player === viewer}
      />
      <BuildingsRef obs={obs} />
    </div>
  );
}
