import type { Action, Observation, Worker } from '@vampire/core';
import {
  BUILDINGS,
  CHARACTERS,
  LOCATIONS,
  LOCATION_ORDER,
  PLOTS,
  PROFESSIONS,
  type LocationId,
  type RegionId,
  type SlotAction,
} from '@vampire/data';
import { useState } from 'react';
import styles from './Board.module.css';
import { profColor } from './colors';
import { LAYOUT } from './layout';
import { locName, playerName, regionName } from './labels';

export const PLAYER_COLORS = ['#d94848', '#3f7fd6', '#e0b13c', '#4caf6a'];

type PlaceAction = Extract<Action, { type: 'place' }>;

/** Краткие подписи ресурсов для действий слотов. */
const R = { gold: 'зол', blood: 'кр', ore: 'руд', compromat: 'комп' } as const;

/** Действие слота коротко, как на поле. */
export function slotShort(a: SlotAction): string {
  switch (a.kind) {
    case 'gain':
      return Object.entries(a.gain)
        .map(([k, v]) => `+${v} ${R[k as keyof typeof R]}`)
        .join(' ');
    case 'lairStash':
      return `копилка; ${a.bloodPerOre} кр → руда`;
    case 'mass':
      return `1 → ${a.rate} зол↔кр ×${a.maxTimes}`;
    case 'market':
      return `${a.buyCost} → руда; руда → ${a.sellGain}`;
    case 'chancery':
      return `комп → 2 / руда ×${a.maxTimes}; ${a.buildRightCost} комп → стройка`;
    case 'chanceryBuild':
      return `${a.compromatCost} комп → стройка`;
    case 'copy':
      return `${a.goldCost} зол → любое действие${a.scope.length < 3 ? ' Леса/Долины' : ''}`;
    case 'commissariatToken':
      return 'жетон: госпиталь в бой';
    case 'revive':
      return `${a.oreCost} руд → из госпиталя`;
    case 'tavernSwap':
      return 'заменить пару';
    case 'cityHall':
      return a.offers.map((o) => `${o.ore} руд → ${o.influence} вл`).join('; ');
  }
}

/** Номер рабочего игрока на фишке (1–3). */
function workerNumber(w: Worker): number {
  return Number(w.id.split('w')[1] ?? 0) + 1;
}

function workerTitle(w: Worker): string {
  const who = playerName(w.owner);
  if (!w.character || !w.profession) return `${who}: рабочий без улучшения`;
  return `${who}: ${CHARACTERS[w.character].name} (${CHARACTERS[w.character].text}) / ${PROFESSIONS[w.profession].name}`;
}

/** Фишка рабочего: цвет игрока, кольцо — цвет профессии, буквы — персонаж. */
export function Token({
  w,
  selected,
  onClick,
}: {
  w: Worker;
  selected?: boolean;
  onClick?: () => void;
}) {
  const ring = w.profession ? profColor(w.profession) : '#2a2430';
  return (
    <button
      type="button"
      className={`${styles.token} ${selected ? styles.tokenSelected : ''} ${onClick ? styles.clickable : ''}`}
      style={{ background: PLAYER_COLORS[w.owner], boxShadow: `0 0 0 3px ${ring}` }}
      title={workerTitle(w)}
      onClick={onClick}
      disabled={!onClick}
    >
      {workerNumber(w)}
    </button>
  );
}

/** Ключ «одинаковых» рабочих: ядро предлагает ход только для одного из них. */
const pairKey = (w: Worker) => `${w.owner}|${w.profession ?? '-'}|${w.character ?? '-'}`;

interface BoardProps {
  obs: Observation;
  /** Допустимые размещения текущего человека (пусто — не его ход размещения). */
  placements: PlaceAction[];
  onPlace(a: PlaceAction): void;
}

/** Поле: три региона как на картоне, госпиталь, размещение кликом по слоту. */
export function Board({ obs, placements, onPlace }: BoardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [choice, setChoice] = useState<PlaceAction[] | null>(null);

  // Выбранный рабочий → его варианты (через «одинакового» представителя, если нужно).
  const byKey = new Map<string, string>();
  for (const a of placements) {
    const w = obs.workers.find((x) => x.id === a.workerId);
    if (w) byKey.set(pairKey(w), w.id);
  }
  const selectedWorker = obs.workers.find((w) => w.id === selected);
  const actingId = selectedWorker ? byKey.get(pairKey(selectedWorker)) : undefined;
  const options = actingId ? placements.filter((a) => a.workerId === actingId) : [];
  const me = placements.length > 0 ? obs.viewer : null;
  const reserve =
    me === null ? [] : obs.workers.filter((w) => w.owner === me && w.position.kind === 'reserve');

  const clickSlot = (location: LocationId, slot: 1 | 2) => {
    const here = options.filter((a) => a.location === location && a.slot === slot);
    if (here.length === 1) {
      onPlace(here[0]!);
      setSelected(null);
    } else if (here.length > 1) setChoice(here);
  };

  const Slot = ({ id, slot }: { id: LocationId; slot: 1 | 2 }) => {
    const at = obs.workers.filter(
      (w) => w.position.kind === 'slot' && w.position.location === id && w.position.slot === slot,
    );
    const here = options.filter((a) => a.location === id && a.slot === slot);
    const canDisplace = here.some((a) => a.displace);
    const locked = slot === 2 && obs.locations[id].slot2Locked;
    const action = LOCATIONS[id].slots[slot - 1] as SlotAction;
    return (
      <div className={styles.slotRow}>
        <div
          className={`${styles.circle} ${slot === 2 ? styles.circle2 : ''} ${here.length ? styles.target : ''} ${canDisplace ? styles.targetDisplace : ''}`}
          onClick={here.length ? () => clickSlot(id, slot) : undefined}
          title={
            here.length
              ? canDisplace
                ? 'Поставить сюда (можно вытеснить)'
                : 'Поставить сюда'
              : undefined
          }
        >
          {at.map((w) => (
            <Token key={w.id} w={w} />
          ))}
          {locked && <span className={styles.lock}>🔒</span>}
        </div>
        <span className={styles.slotText}>{slotShort(action)}</span>
      </div>
    );
  };

  const Location = ({ id }: { id: LocationId }) => {
    const loc = obs.locations[id];
    const blocked = obs.blocks.some((b) => b.location === id);
    return (
      <div
        className={`${styles.location} ${blocked ? styles.blocked : ''}`}
        title={blocked ? 'Заблокирована Интриганом' : undefined}
      >
        <div className={styles.locTitle}>
          {LOCATIONS[id].name}
          {loc.professionToken && (
            <span
              className={styles.profToken}
              style={{ background: profColor(loc.professionToken) }}
              title={`Жетон профессии: ${PROFESSIONS[loc.professionToken].name} — она вытесняет из второго слота`}
            />
          )}
        </div>
        <Slot id={id} slot={1} />
        <Slot id={id} slot={2} />
        {id === 'lair' && <div className={styles.stash}>копилка: {obs.lair.stash} руд</div>}
      </div>
    );
  };

  const Region = ({ region }: { region: RegionId }) => {
    const citadel = obs.buildings.find((b) => b.type === 'citadel' && b.region === region);
    const atStar = obs.workers.filter(
      (w) => w.position.kind === 'citadelSpot' && w.position.region === region,
    );
    const power = obs.powerTokens.filter((t) => t.region === region);
    return (
      <section className={`${styles.region} ${styles[region]}`}>
        <div className={styles.regionTitle}>
          {regionName(region)}
          {obs.commissariat?.region === region && (
            <span
              className={styles.badge}
              style={{ background: PLAYER_COLORS[obs.commissariat.owner] }}
            >
              Комиссариат
            </span>
          )}
          {power.map((t, i) => (
            <span
              key={i}
              className={styles.badge}
              style={{ background: PLAYER_COLORS[t.owner] }}
              title="Жетоны силы"
            >
              +{t.count} сил
            </span>
          ))}
        </div>
        <div className={styles.map} style={{ height: LAYOUT[region].height }}>
          <svg className={styles.links} viewBox="0 0 100 100" preserveAspectRatio="none">
            {PLOTS.filter((p) => p.region === region).flatMap((p) => {
              const [hx, hy] = LAYOUT[region].plots[p.id] ?? [50, 50];
              return p.adjacent.map((l) => {
                const [lx, ly] = LAYOUT[region].locations[l] ?? [50, 50];
                return <line key={p.id + l} x1={hx} y1={hy} x2={lx} y2={ly} />;
              });
            })}
          </svg>
          {LOCATION_ORDER.filter((l) => LOCATIONS[l].region === region).map((l) => {
            const [x, y] = LAYOUT[region].locations[l] ?? [50, 50];
            return (
              <div key={l} className={styles.node} style={{ left: `${x}%`, top: `${y}%` }}>
                <Location id={l} />
              </div>
            );
          })}
          {PLOTS.filter((p) => p.region === region).map((p) => {
            const [x, y] = LAYOUT[region].plots[p.id] ?? [50, 50];
            const b = obs.buildings.find((v) => v.plot === p.id);
            const surcharge = Object.keys(p.surcharge).length > 0;
            return (
              <span
                key={p.id}
                className={`${styles.node} ${styles.hex} ${surcharge ? styles.hexDouble : ''}`}
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  ...(b ? { background: PLAYER_COLORS[b.owner], color: '#fff' } : {}),
                }}
                title={`Участок у ${p.adjacent.map(locName).join(' и ')}${surcharge ? ' (двойной, с доплатой)' : ''}${b ? `: ${BUILDINGS[b.type].name}, ${playerName(b.owner)}` : ' — свободен'}`}
              >
                {b ? BUILDINGS[b.type].name : surcharge ? 'двойной' : 'участок'}
              </span>
            );
          })}
          <span
            className={`${styles.node} ${styles.citadel}`}
            style={{
              left: `${LAYOUT[region].star[0]}%`,
              top: `${LAYOUT[region].star[1]}%`,
              ...(citadel ? { background: PLAYER_COLORS[citadel.owner], color: '#fff' } : {}),
            }}
            title={citadel ? `Цитадель: ${playerName(citadel.owner)}` : 'Место Цитадели свободно'}
          >
            ★{citadel ? ` ${playerName(citadel.owner)}` : ''}
            {atStar.map((w) => (
              <Token key={w.id} w={w} />
            ))}
          </span>
        </div>
      </section>
    );
  };

  const hospital = obs.workers.filter((w) => w.position.kind === 'hospital');

  return (
    <div className={styles.wrap}>
      <div className={styles.board}>
        <div className={styles.cityArea}>
          <Region region="city" />
        </div>
        <div className={styles.forestArea}>
          <Region region="forest" />
        </div>
        <div className={styles.hospital}>
          <div className={styles.regionTitle}>Госпиталь</div>
          <div>
            {hospital.map((w) => (
              <Token key={w.id} w={w} />
            ))}
          </div>
          <div className={styles.slotText}>содержание −1 кр</div>
        </div>
        <div className={styles.valleyArea}>
          <Region region="valley" />
        </div>
      </div>

      {me !== null && (
        <div className={styles.reserve}>
          <span>Ваш запас — выберите рабочего, затем подсвеченный слот:</span>
          {reserve.map((w) => (
            <Token
              key={w.id}
              w={w}
              selected={selected === w.id}
              onClick={() => setSelected(selected === w.id ? null : w.id)}
            />
          ))}
          {selectedWorker && options.length === 0 && (
            <span className={styles.warn}>этому рабочему некуда встать</span>
          )}
        </div>
      )}

      {choice && (
        <div className={styles.popup}>
          <div>{locName(choice[0]!.location)}, слот 2:</div>
          {choice.map((a, i) => (
            <button
              key={i}
              onClick={() => {
                onPlace(a);
                setChoice(null);
                setSelected(null);
              }}
            >
              {a.displace ? 'Вытеснить рабочего из первого слота' : 'Встать без вытеснения'}
            </button>
          ))}
          <button onClick={() => setChoice(null)}>Отмена</button>
        </div>
      )}
    </div>
  );
}
