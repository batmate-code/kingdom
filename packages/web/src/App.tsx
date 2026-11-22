import { BOT_FACTORIES } from '@vampire/bots';
import { cityEntryCost, getLegalActions, getObservation, type Action } from '@vampire/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './App.module.css';
import { Board, PLAYER_COLORS } from './Board';
import { Icon, RichText } from './Icon';
import { Draft } from './Draft';
import { PlayerBoard } from './PlayerBoard';
import { actionLabel, decisionTitle, locName, playerName } from './labels';
import { useGame, type Seat } from './store';

const BOT_OPTIONS = ['human', ...Object.keys(BOT_FACTORIES).filter((b) => b !== 'first-legal')];
const SEAT_NAME: Record<string, string> = {
  human: 'Человек',
  heuristic: 'Умный бот',
  random: 'Случайный бот',
  'random-grouped': 'Случайный бот (по ступеням)',
};

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
              <RichText text={actionLabel(state, a)} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function Game() {
  const { state, seats, log, error, botStep, reset, act } = useGame();
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
        <span>
          <Icon name="cityEntry" /> {cityEntryCost(state)} <Icon name="gold" />
        </span>
        <span>Колода: {obs.deckSize}</span>
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
        <div className={styles.left}>
          <Board
            obs={obs}
            placements={legal.filter(
              (a): a is Extract<Action, { type: 'place' }> => a.type === 'place',
            )}
            onPlace={act}
          />
          <div className={styles.draftArea}>
            <Draft obs={obs} legal={legal} onPick={act} />
          </div>
        </div>
        <aside className={styles.side}>
          <div className={styles.turn}>
            <h3>
              <RichText text={decisionTitle(state)} />
            </h3>
            {botTurn && <div className={styles.muted}>Ходит бот…</div>}
            {error && <div className={styles.warn}>{error}</div>}
            {!botTurn && pending?.kind === 'placement' && (
              <div className={styles.muted}>
                Выберите рабочего внизу поля и кликните по подсвеченному слоту.
              </div>
            )}
            {!botTurn && (
              <Actions legal={legal.filter((a) => a.type !== 'place' && a.type !== 'draftPick')} />
            )}
          </div>
          <PlayerBoard obs={obs} state={state} defaultPlayer={viewer} />
          <details className={styles.log}>
            <summary>Журнал</summary>
            {log.map((l) => (
              <div key={l.id}>
                <RichText text={l.text} />
              </div>
            ))}
            <div ref={logEnd} />
          </details>
        </aside>
      </main>
    </div>
  );
}

export function App() {
  const started = useGame((s) => s.state !== null);
  return <div className={styles.app}>{started ? <Game /> : <Setup />}</div>;
}
