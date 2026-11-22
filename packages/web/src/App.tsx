import { BOT_FACTORIES } from '@vampire/bots';
import { getScores, type Action, type PlayerScore, type RuleToggles } from '@vampire/core';
import { useEffect, useRef, useState } from 'react';
import styles from './App.module.css';
import { ActionBar } from './ActionBar';
import { BoardMock } from './board/BoardMock';
import { EntryPrice } from './EntryPrice';
import { Watch } from './Watch';
import { PLAYER_COLORS } from './Board';
import { BoardSvg, type BoardTargets } from './board/BoardSvg';
import { Icon, RichText } from './Icon';
import { CombatModal } from './CombatModal';
import { CombatResultModal } from './CombatResultModal';
import { DraftModal } from './DraftModal';
import { RoundModal } from './RoundModal';
import { screenView, targetHint } from './view';
import { TurnToast } from './TurnToast';
import { HandPanel, PlayersPanel } from './SidePanel';
import { playerName } from './labels';
import { useGame, type Seat } from './store';

/** Экспериментальные и прежние правила (переключатели ядра, отличные от значений по умолчанию). */
const EXPERIMENTS: { label: string; rules: Partial<RuleToggles> }[] = [
  { label: 'Драфт: игроков + 1 персонажей и случайных профессий', rules: { draftSize: 'players' } },
  { label: '+2 крови на старте', rules: { startResources: 'blood2' } },
  {
    label: 'Двойные участки по картону: Лес и Долина +2 золота, Город +1 руда',
    rules: { plotSurcharge: 'base' },
  },
];

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
  const [experiments, setExperiments] = useState<boolean[]>(EXPERIMENTS.map(() => false));
  const rules = Object.assign(
    {},
    ...EXPERIMENTS.filter((_, i) => experiments[i]).map((e) => e.rules),
  );
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
      <p>Экспериментальные правила:</p>
      {EXPERIMENTS.map((e, i) => (
        <label key={e.label} className={styles.row}>
          <input
            type="checkbox"
            checked={experiments[i]}
            onChange={() => setExperiments(experiments.map((v, j) => (j === i ? !v : v)))}
          />{' '}
          {e.label}
        </label>
      ))}
      <button className={styles.primary} onClick={() => start(seats, seed, rules)}>
        Начать партию
      </button>
    </section>
  );
}

function Game() {
  const { state, seats, log, error, botStep, reset, act, undo, history, lastMove, combatReports } =
    useGame();
  const canUndo = history.some((h) => h.byHuman);
  const [delay, setDelay] = useState(400);
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<Action[] | null>(null);
  // Окно начала раунда: какой раунд уже показан; очки на начало каждого раунда — для «+N за раунд».
  const [roundShown, setRoundShown] = useState(0);
  const roundScores = useRef<Record<number, PlayerScore[]>>({});
  const roundOpen = state !== null && state.phase !== 'gameOver' && state.round > roundShown;
  if (state && roundScores.current[state.round] === undefined) {
    roundScores.current[state.round] = getScores(state);
  }
  // Окно итогов боя: первый ещё не просмотренный бой (id итогов растут на всю сессию).
  const [combatSeen, setCombatSeen] = useState(-1);
  const combatResult = combatReports.find((r) => r.id > combatSeen) ?? null;
  const logEnd = useRef<HTMLDivElement>(null);
  const pending = state?.pending ?? null;
  const botTurn = pending !== null && seats[pending.player] !== 'human';

  // Новое состояние — сбросить выбор рабочего и варианты цели.
  useEffect(() => {
    setFocus(null);
    setSelected(null);
  }, [state]);

  // Ctrl+Z — отменить ход; Esc — отменить выбор.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
      if (e.key === 'Escape') {
        setFocus(null);
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  useEffect(() => {
    if (!botTurn || paused || roundOpen || combatResult) return;
    const t = setTimeout(() => botStep(), delay);
    return () => clearTimeout(t);
  }, [state, botTurn, paused, roundOpen, combatResult, delay, botStep]);

  // Тело в фигурных скобках: в новых Chrome scrollIntoView возвращает Promise, а эффект может
  // вернуть только функцию очистки.
  useEffect(() => {
    void logEnd.current?.scrollIntoView({ block: 'end' });
  }, [log]);

  if (!state) return null;
  const { viewer, obs, legal, slots, plots, barLegal, strengths, drafting, human } = screenView(
    state,
    seats,
    selected,
    focus,
  );
  const hasTargets = Object.keys(slots).length + Object.keys(plots).length > 0;
  const targets: BoardTargets | undefined = hasTargets
    ? {
        slots,
        plots,
        hint: (actions) => targetHint(state, viewer, actions),
        onPick: (actions) => {
          if (actions.length === 1) act(actions[0]!);
          else setFocus(actions);
        },
      }
    : undefined;

  return (
    <div className={styles.game}>
      <header className={styles.header}>
        <b>
          Раунд {state.round} / {state.config.rounds}
        </b>
        <span>
          <Icon name="cityEntry" /> <EntryPrice view={state} />
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
        <button
          onClick={undo}
          disabled={!canUndo}
          title="Отменить ваш последний ход и ходы ботов после него (Ctrl+Z)"
        >
          ↶ Отменить ход
        </button>
        <button onClick={reset}>Новая партия</button>
      </header>
      <main className={styles.boardArea}>
        <BoardSvg obs={obs} landscape targets={targets} lastMove={lastMove} strengths={strengths} />
        <TurnToast
          player={pending?.player ?? null}
          phase={state.phase}
          human={pending !== null && seats[pending.player] === 'human'}
        />
        {combatResult && (
          <CombatResultModal
            report={combatResult}
            earlier={combatReports.filter(
              (r) => r.round === combatResult.round && r.id < combatResult.id,
            )}
            viewer={viewer}
            onClose={() => setCombatSeen(combatResult.id)}
          />
        )}
        {roundOpen && !combatResult && (
          <RoundModal
            state={state}
            scores={getScores(state)}
            previous={roundScores.current[state.round - 1] ?? null}
            seats={seats}
            viewer={viewer}
            onClose={() => setRoundShown(state.round)}
          />
        )}
        {!roundOpen && !combatResult && (
          <CombatModal
            state={state}
            obs={obs}
            legal={legal}
            strengths={strengths}
            viewer={viewer}
            onPick={act}
          />
        )}
        {drafting && (
          <DraftModal
            state={state}
            obs={obs}
            legal={legal}
            onPick={act}
            viewer={viewer}
            pendingPlayer={pending?.player ?? null}
          />
        )}
      </main>
      <aside className={styles.side}>
        {human && (
          <HandPanel
            obs={obs}
            player={viewer}
            active={pending?.kind === 'placement' && !botTurn}
            selected={selected}
            onSelect={setSelected}
          />
        )}
        <PlayersPanel obs={obs} state={state} viewer={viewer} seats={seats} />
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
      <div className={styles.barArea}>
        <ActionBar
          state={state}
          legal={barLegal}
          botTurn={botTurn}
          hint={
            focus
              ? 'Выберите вариант для этой цели'
              : pending?.kind === 'placement'
                ? 'Выберите рабочего справа и кликните подсвеченное гнездо'
                : pending?.kind === 'build'
                  ? 'Кликните подсвеченный участок или место Цитадели'
                  : pending?.kind === 'draftPick'
                    ? 'Выберите карту в окне драфта'
                    : pending?.kind === 'combatToken'
                      ? 'Выберите жетон боя в окне над полем'
                      : null
          }
          error={error}
          onAct={act}
          onCancel={focus ? () => setFocus(null) : undefined}
        />
      </div>
    </div>
  );
}

/** ?autostart[=seed] — сразу начать партию «человек + 2 бота» (для проверки вида поля). */
function autostartSeed(): number | null {
  const v = new URLSearchParams(window.location.search).get('autostart');
  return v === null ? null : Number(v) || 1;
}

export function App() {
  const params = new URLSearchParams(window.location.search);
  if (['board', 'map', 'mix', 'layout', 'panel'].includes(params.get('mock') ?? ''))
    return <BoardMock />;
  const watch = params.get('watch');
  if (watch) return <Watch file={watch} />;
  return <Play />;
}

function Play() {
  const started = useGame((s) => s.state !== null);
  useEffect(() => {
    const seed = autostartSeed();
    if (seed !== null && !useGame.getState().state) {
      // ?rule=draftSize=players — переключатели правил (можно несколько).
      const rules = Object.fromEntries(
        new URLSearchParams(window.location.search).getAll('rule').map((r) => r.split('=')),
      ) as Partial<RuleToggles>;
      useGame.getState().start(['human', 'heuristic', 'heuristic'], seed, rules);
    }
  }, []);
  return <div className={styles.app}>{started ? <Game /> : <Setup />}</div>;
}
