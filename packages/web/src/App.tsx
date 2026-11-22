import { BOT_FACTORIES } from '@vampire/bots';
import {
  cityEntryCost,
  getLegalActions,
  getObservation,
  getScores,
  type Action,
  type Observation,
  type Worker,
} from '@vampire/core';
import {
  BUILDINGS,
  CHARACTERS,
  COMBAT_TOKEN_ORDER,
  COMBAT_TOKENS,
  LOCATIONS,
  LOCATION_ORDER,
  PLOTS,
  PROFESSIONS,
  REGION_ORDER,
  type LocationId,
  type SlotAction,
} from '@vampire/data';
import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './App.module.css';
import {
  actionLabel,
  decisionTitle,
  locName,
  playerName,
  regionName,
  resText,
  workerLabel,
} from './labels';
import { useGame, type Seat } from './store';

const PLAYER_COLORS = ['#e05252', '#4f8fe0', '#e0b94f', '#5fc27a'];
const BOT_OPTIONS = ['human', ...Object.keys(BOT_FACTORIES).filter((b) => b !== 'first-legal')];
const SEAT_NAME: Record<string, string> = {
  human: 'Человек',
  heuristic: 'Умный бот',
  random: 'Случайный бот',
  'random-grouped': 'Случайный бот (по ступеням)',
};

/** Краткое описание действия слота из data. */
function slotText(a: SlotAction): string {
  switch (a.kind) {
    case 'gain':
      return resText(a.gain);
    case 'lairStash':
      return `копилка + ${a.bloodPerOre} кр → руда`;
    case 'mass':
      return `зол ↔ кр 1 → ${a.rate}, до ${a.maxTimes} раз`;
    case 'market':
      return `${a.buyCost} → руда / руда → ${a.sellGain}`;
    case 'chancery':
      return `комп → 2 зол/кр или руда (до ${a.maxTimes}); ${a.buildRightCost} комп → стройка`;
    case 'chanceryBuild':
      return `${a.compromatCost} комп → стройка`;
    case 'copy':
      return `${a.goldCost} зол → копия`;
    case 'commissariatToken':
      return 'жетон Комиссариата';
    case 'revive':
      return `${a.oreCost} руды → из госпиталя`;
    case 'tavernSwap':
      return 'замена пары';
    case 'cityHall':
      return a.offers.map((o) => `${o.ore} руд → ${o.influence} вл`).join(' / ');
  }
}

function Chip({ w }: { w: Worker }) {
  return (
    <span
      className={styles.chip}
      style={{ borderColor: PLAYER_COLORS[w.owner] }}
      title={playerName(w.owner)}
    >
      <span className={styles.dot} style={{ background: PLAYER_COLORS[w.owner] }} />
      {workerLabel(w)}
    </span>
  );
}

function Setup() {
  const start = useGame((s) => s.start);
  const [seats, setSeats] = useState<Seat[]>(['human', 'heuristic', 'heuristic']);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000));
  return (
    <section className={styles.setup}>
      <h1>Вампирская игра</h1>
      <p>Кто сидит в креслах:</p>
      {seats.map((seat, i) => (
        <div key={i} className={styles.row}>
          <span className={styles.dot} style={{ background: PLAYER_COLORS[i] }} /> {playerName(i)}
          <select
            value={seat}
            onChange={(e) => setSeats(seats.map((s, j) => (j === i ? e.target.value : s)))}
          >
            {BOT_OPTIONS.map((b) => (
              <option key={b} value={b}>
                {SEAT_NAME[b] ?? b}
              </option>
            ))}
          </select>
        </div>
      ))}
      <div className={styles.row}>
        <button disabled={seats.length <= 2} onClick={() => setSeats(seats.slice(0, -1))}>
          − игрок
        </button>
        <button disabled={seats.length >= 4} onClick={() => setSeats([...seats, 'heuristic'])}>
          + игрок
        </button>
      </div>
      <div className={styles.row}>
        Seed: <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
      </div>
      <button className={styles.primary} onClick={() => start(seats, seed)}>
        Начать партию
      </button>
    </section>
  );
}

function Location({ obs, id }: { obs: Observation; id: LocationId }) {
  const def = LOCATIONS[id];
  const loc = obs.locations[id];
  const at = (slot: 1 | 2) =>
    obs.workers.filter(
      (w) => w.position.kind === 'slot' && w.position.location === id && w.position.slot === slot,
    );
  const blocked = obs.blocks.some((b) => b.location === id);
  return (
    <div className={styles.location}>
      <div className={styles.locHead}>
        <b>{def.name}</b>
        {loc.professionToken && (
          <span
            className={styles.token}
            style={{ background: PROFESSIONS[loc.professionToken].color }}
          >
            {PROFESSIONS[loc.professionToken].name}
          </span>
        )}
        {blocked && <span className={styles.warn}>заблокирована</span>}
      </div>
      {([1, 2] as const).map((slot) => (
        <div key={slot} className={styles.slot}>
          <span className={styles.slotNum}>
            {slot}
            {slot === 2 && loc.slot2Locked ? '🔒' : ''}
          </span>
          <span className={styles.muted}>{slotText(def.slots[slot - 1] as SlotAction)}</span>
          <div>
            {at(slot).map((w) => (
              <Chip key={w.id} w={w} />
            ))}
          </div>
        </div>
      ))}
      {id === 'lair' && <div className={styles.muted}>Копилка: {obs.lair.stash} руды</div>}
    </div>
  );
}

function Board({ obs }: { obs: Observation }) {
  return (
    <div className={styles.board}>
      {REGION_ORDER.map((region) => {
        const citadel = obs.buildings.find((b) => b.type === 'citadel' && b.region === region);
        const atCitadel = obs.workers.filter(
          (w) => w.position.kind === 'citadelSpot' && w.position.region === region,
        );
        const tokens = obs.powerTokens.filter((t) => t.region === region);
        return (
          <div key={region} className={styles.region}>
            <h3>
              {regionName(region)}
              {obs.commissariat?.region === region && (
                <span className={styles.muted}>
                  {' '}
                  · жетон Комиссариата у {playerName(obs.commissariat.owner)}
                </span>
              )}
            </h3>
            {LOCATION_ORDER.filter((l) => LOCATIONS[l].region === region).map((l) => (
              <Location key={l} obs={obs} id={l} />
            ))}
            <div className={styles.extras}>
              <div>
                Звезда:{' '}
                {citadel ? (
                  <span style={{ color: PLAYER_COLORS[citadel.owner] }}>
                    Цитадель {playerName(citadel.owner)}
                  </span>
                ) : (
                  <span className={styles.muted}>свободна</span>
                )}
                {atCitadel.map((w) => (
                  <Chip key={w.id} w={w} />
                ))}
              </div>
              <div>
                Участки:{' '}
                {PLOTS.filter((p) => p.region === region).map((p) => {
                  const b = obs.buildings.find((x) => x.plot === p.id);
                  return (
                    <span
                      key={p.id}
                      className={styles.plot}
                      style={b ? { borderColor: PLAYER_COLORS[b.owner] } : {}}
                    >
                      {p.adjacent.map(locName).join('–')}: {b ? BUILDINGS[b.type].name : '—'}
                    </span>
                  );
                })}
              </div>
              {tokens.length > 0 && (
                <div>
                  Жетоны силы:{' '}
                  {tokens.map((t, i) => (
                    <span key={i} style={{ color: PLAYER_COLORS[t.owner] }}>
                      {playerName(t.owner)} +{t.count}{' '}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Players({ obs, seats }: { obs: Observation; seats: Seat[] }) {
  const scores = getScores(useGame.getState().state!);
  return (
    <div className={styles.players}>
      {obs.players.map((p, i) => {
        const score = scores.find((s) => s.player === i);
        const own = obs.workers.filter((w) => w.owner === i);
        return (
          <div key={i} className={styles.player} style={{ borderColor: PLAYER_COLORS[i] }}>
            <div className={styles.locHead}>
              <b style={{ color: PLAYER_COLORS[i] }}>{playerName(i)}</b>
              <span className={styles.muted}>{SEAT_NAME[seats[i] ?? ''] ?? seats[i]}</span>
              {obs.firstPlayer === i && <span className={styles.token}>первый</span>}
              {p.passed && <span className={styles.warn}>пас</span>}
            </div>
            <div>
              <b>{score?.vp ?? 0} ПО</b> · престиж {p.prestige}
              {score?.rank === 1 && obs.phase === 'gameOver' ? ' · ПОБЕДА' : ''}
            </div>
            <div>
              Золото {p.resources.gold} · Кровь {p.resources.blood} · Руда {p.resources.ore} ·
              Компромат {p.resources.compromat}
            </div>
            <div>
              Влияние: {REGION_ORDER.map((r) => `${regionName(r)} ${p.influence[r]}`).join(' · ')}
            </div>
            <div className={styles.muted}>
              Жетоны боя:{' '}
              {COMBAT_TOKEN_ORDER.filter((t) => p.combatTokens.hand[t] > 0)
                .map(
                  (t) =>
                    `${COMBAT_TOKENS[t].name}${p.combatTokens.hand[t] > 1 ? ` ×${p.combatTokens.hand[t]}` : ''}`,
                )
                .join(', ') || 'нет'}
            </div>
            {(p.draftPick.character || p.draftPick.profession) && (
              <div>
                Взято на драфте:{' '}
                {p.draftPick.character ? CHARACTERS[p.draftPick.character].name : '—'} /{' '}
                {p.draftPick.profession ? PROFESSIONS[p.draftPick.profession].name : '—'}
              </div>
            )}
            <div>
              Рабочие:{' '}
              {own.map((w) => (
                <span key={w.id} className={styles.workerLine}>
                  {workerLabel(w)}{' '}
                  <span className={styles.muted}>
                    (
                    {w.position.kind === 'reserve'
                      ? 'запас'
                      : w.position.kind === 'hospital'
                        ? 'госпиталь'
                        : w.position.kind === 'citadelSpot'
                          ? 'у звезды'
                          : locName(w.position.location)}
                    )
                  </span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Кнопки ходов; размещение сгруппировано по локациям. */
function Actions({ legal }: { legal: Action[] }) {
  const state = useGame((s) => s.state)!;
  const act = useGame((s) => s.act);
  const groups = useMemo(() => {
    const map = new Map<string, Action[]>();
    for (const a of legal) {
      const key = a.type === 'place' ? locName(a.location) : '';
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return [...map.entries()];
  }, [legal]);
  return (
    <div className={styles.actions}>
      {groups.map(([group, actions]) => (
        <div key={group} className={styles.group}>
          {group && <div className={styles.groupTitle}>{group}</div>}
          {actions.map((a, i) => (
            <button key={i} onClick={() => act(a)}>
              {actionLabel(state, a)}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function Game() {
  const { state, seats, log, error, botStep, reset } = useGame();
  const [delay, setDelay] = useState(400);
  const [paused, setPaused] = useState(false);
  const logEnd = useRef<HTMLDivElement>(null);
  const pending = state?.pending ?? null;
  const botTurn = pending !== null && seats[pending.player] !== 'human';

  useEffect(() => {
    if (!botTurn || paused) return;
    const t = setTimeout(() => botStep(), delay);
    return () => clearTimeout(t);
  }, [state, botTurn, paused, delay, botStep]);

  // Тело в фигурных скобках: в новых Chrome scrollIntoView возвращает Promise, а эффект может
  // вернуть только функцию очистки.
  useEffect(() => {
    void logEnd.current?.scrollIntoView({ block: 'end' });
  }, [log]);

  if (!state) return null;
  // Смотрим глазами человека, который ходит (или первого человека за столом).
  const viewer = pending && !botTurn ? pending.player : Math.max(0, seats.indexOf('human'));
  const obs = getObservation(state, viewer);
  const legal = pending && !botTurn ? getLegalActions(state) : [];

  return (
    <div className={styles.game}>
      <header className={styles.header}>
        <b>
          Раунд {state.round} / {state.config.rounds}
        </b>
        <span>Вход в Город: {cityEntryCost(state)} зол</span>
        <span>Колода: {obs.deckSize}</span>
        {obs.offer.characters.length + obs.offer.professions.length > 0 && (
          <span>
            Выложено / Таверна:{' '}
            {obs.offer.characters
              .map((c) => `${CHARACTERS[c].name} (${CHARACTERS[c].upkeep})`)
              .join(', ')}
            {obs.offer.professions.length ? ' · ' : ''}
            {obs.offer.professions.map((p) => PROFESSIONS[p].name).join(', ')}
          </span>
        )}
        <span className={styles.spacer} />
        <label>
          Скорость ботов{' '}
          <select value={delay} onChange={(e) => setDelay(Number(e.target.value))}>
            <option value={1200}>медленно</option>
            <option value={400}>обычно</option>
            <option value={60}>быстро</option>
          </select>
        </label>
        <button onClick={() => setPaused(!paused)}>{paused ? '▶ Продолжить' : '⏸ Пауза'}</button>
        <button onClick={reset}>Новая партия</button>
      </header>
      <main className={styles.main}>
        <Board obs={obs} />
        <aside className={styles.side}>
          <div className={styles.turn}>
            <h3>{decisionTitle(state)}</h3>
            {botTurn && <div className={styles.muted}>Ходит бот…</div>}
            {error && <div className={styles.warn}>{error}</div>}
            {!botTurn && <Actions legal={legal} />}
          </div>
          <Players obs={obs} seats={seats} />
          <div className={styles.log}>
            {log.map((l) => (
              <div key={l.id}>{l.text}</div>
            ))}
            <div ref={logEnd} />
          </div>
        </aside>
      </main>
    </div>
  );
}

export function App() {
  const started = useGame((s) => s.state !== null);
  return <div className={styles.app}>{started ? <Game /> : <Setup />}</div>;
}
