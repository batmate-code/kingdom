import { BOT_FACTORIES } from '@vampire/bots';
import {
  getScores,
  RULE_OPTIONS,
  type Action,
  type PlayerScore,
  type RuleOption,
  type RuleToggles,
} from '@vampire/core';
import { useEffect, useRef, useState } from 'react';
import styles from './App.module.css';
import { ActionBar } from './ActionBar';
import { EntryPrice } from './EntryPrice';
import { Watch } from './Watch';
import { PLAYER_COLORS } from './players';
import { BoardSvg, type BoardTargets } from './board/BoardSvg';
import { Icon, RichText } from './Icon';
import { CombatModal } from './CombatModal';
import { CombatResultModal } from './CombatResultModal';
import { UndoVoteModal } from './UndoVoteModal';
import { ResourceToasts } from './ResourceToasts';
import { useMotionBusy } from './board/tokenMotion';
import { ChoiceModal } from './ChoiceModal';
import { DraftModal } from './DraftModal';
import { RoundModal } from './RoundModal';
import { screenView, targetHint } from './view';
import { TurnToast } from './TurnToast';
import { HandPanel, PlayersPanel } from './SidePanel';
import { playerName } from './labels';
import { useGame, type HostRoom, type Seat } from './store';
import { inviteUrl, joinAsGuest, useOnline } from './online/connect';
import { inviteFrom } from './online/invite';

/** Экспериментальные и прежние правила — чекбоксы из ядра (RULE_OPTIONS). */
const EXPERIMENTS: { label: string; rules: Partial<RuleToggles> }[] = (
  Object.entries(RULE_OPTIONS) as [keyof RuleToggles, readonly RuleOption[]][]
).flatMap(([key, options]) =>
  options.map((o) => ({ label: o.label, rules: { [key]: o.value } as Partial<RuleToggles> })),
);

const BOT_OPTIONS = [
  'human',
  'guest',
  ...Object.keys(BOT_FACTORIES).filter((b) => b !== 'first-legal'),
];
const SEAT_NAME: Record<string, string> = {
  human: 'Человек',
  guest: 'Гость по ссылке',
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
  const {
    state,
    seats,
    log,
    error,
    botStep,
    reset,
    act,
    undo,
    canUndo: undoable,
    lastMove,
    combatReports,
    hostRoom,
    guest,
    undoVote,
  } = useGame();
  // Компонент подписан на весь store — кнопка пересчитывается после каждого хода. У гостя
  // своей истории нет: можно ли просить отмену, говорит снимок хоста.
  const canUndo = undoable();
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

  const motionBusy = useMotionBusy();
  useEffect(() => {
    // Боты ждут, пока открыты окна и пока игроки решают, отменять ли ход.
    // …и пока фишка едет по полю и стоит полсекунды на месте (автор 24.11).
    if (!botTurn || paused || roundOpen || combatResult || undoVote || motionBusy) return;
    const t = setTimeout(() => botStep(), delay);
    return () => clearTimeout(t);
  }, [state, botTurn, paused, roundOpen, combatResult, undoVote, motionBusy, delay, botStep]);

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
    guest ? { viewer: guest.seat, legal: guest.legal } : null,
  );
  const hasTargets = Object.keys(slots).length + Object.keys(plots).length > 0;
  // Окно выбора: варианты одной цели на поле или решение без целей на поле, если вариантов ≥ 2.
  const modalChoice =
    focus ??
    (!hasTargets &&
    !botTurn &&
    pending !== null &&
    pending.kind !== 'placement' &&
    pending.kind !== 'build' &&
    // Драфт и улучшение решаются в своём окне драфта.
    pending.kind !== 'draftPick' &&
    pending.kind !== 'upgrade' &&
    // Жетоны боя — в окне жетонов.
    pending.kind !== 'combatToken' &&
    barLegal.length >= 2
      ? barLegal
      : null);
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
        {hostRoom && <InvitePanel room={hostRoom} />}
        {guest && <GuestStatus />}
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
          title={
            hostRoom || guest
              ? 'Попросить отменить ваш последний ход — нужно согласие всех игроков'
              : 'Отменить ваш последний ход и ходы ботов после него (Ctrl+Z)'
          }
        >
          ↶ Отменить ход
        </button>
        <button
          onClick={() => {
            reset();
            // Гость уходит из комнаты на экран настройки.
            if (guest) leavePage();
          }}
        >
          {guest ? 'Выйти' : 'Новая партия'}
        </button>
      </header>
      <main className={styles.boardArea}>
        <UndoVoteModal />
        <ResourceToasts />
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
        {!roundOpen && !combatResult && !motionBusy && (
          <CombatModal
            state={state}
            obs={obs}
            legal={legal}
            strengths={strengths}
            viewer={viewer}
            onPick={act}
          />
        )}
        {/* Выборы игры — в окне над полем (автор 24.11); на поле остаются клики по целям. */}
        {modalChoice && !motionBusy && (
          <ChoiceModal
            state={state}
            actions={modalChoice}
            viewer={viewer}
            onPick={act}
            onCancel={focus ? () => setFocus(null) : undefined}
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
        <PlayersPanel
          obs={obs}
          state={state}
          viewer={viewer}
          seats={seats}
          pick={
            pending?.kind === 'placement' && !botTurn
              ? { selected, onPick: (id) => setSelected(selected === id ? null : id) }
              : undefined
          }
        />
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
          legal={modalChoice ? [] : barLegal}
          botTurn={botTurn}
          hint={
            focus
              ? 'Выберите вариант для этой цели'
              : pending?.kind === 'placement'
                ? 'Выберите рабочего справа и кликните подсвеченное гнездо'
                : pending?.kind === 'build'
                  ? 'Кликните подсвеченный участок или место Цитадели'
                  : pending?.kind === 'executioner'
                    ? 'Палач: кликните рабочего, которого вытеснить, или откажитесь'
                    : pending?.kind === 'spyMove'
                      ? 'Шпион: кликните подсвеченный слот, куда перейти, или оставьте его на месте'
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
  const watch = params.get('watch');
  if (watch) return <Watch file={watch} />;
  return <Play />;
}

function Play() {
  const started = useGame((s) => s.state !== null);
  const invite = inviteFrom(window.location);
  useEffect(() => {
    // Ссылка не меняется без перезагрузки страницы — читаем её здесь же.
    const link = inviteFrom(window.location);
    if (link) {
      joinAsGuest(link.room, link.key);
      return;
    }
    const seed = autostartSeed();
    if (seed !== null && !useGame.getState().state) {
      // ?rule=draftSize=players — переключатели правил (можно несколько).
      const rules = Object.fromEntries(
        new URLSearchParams(window.location.search).getAll('rule').map((r) => r.split('=')),
      ) as Partial<RuleToggles>;
      useGame.getState().start(['human', 'heuristic', 'heuristic'], seed, rules);
    }
  }, []);
  return <div className={styles.app}>{started ? <Game /> : invite ? <Joining /> : <Setup />}</div>;
}

/** Хост: ссылки-приглашения для кресел гостей и кто из них в сети. */
function InvitePanel({ room }: { room: HostRoom }) {
  const connected = useOnline((s) => s.connected);
  const busy = useOnline((s) => s.hostBusy);
  const [copied, setCopied] = useState<number | null>(null);
  if (busy) {
    return <span className={styles.invites}>Комнату держит другая вкладка этого браузера</span>;
  }
  return (
    <span className={styles.invites}>
      {room.invites.map(({ seat, key }) => (
        <button
          key={seat}
          title="Скопировать ссылку-приглашение"
          onClick={() => {
            void navigator.clipboard
              .writeText(inviteUrl(room.room, key))
              .then(() => setCopied(seat));
          }}
        >
          <span
            className={styles.dot}
            style={{
              background: PLAYER_COLORS[seat],
              opacity: connected.includes(seat) ? 1 : 0.35,
            }}
          />{' '}
          {playerName(seat)}: {connected.includes(seat) ? 'в сети' : 'не в сети'}
          {copied === seat ? ' — ссылка скопирована' : ' — пригласить'}
        </button>
      ))}
    </span>
  );
}

/** Тексты состояния связи гостя. */
const GUEST_LINK_TEXT = {
  connecting: 'Подключение к хосту… Хост должен держать партию открытой во вкладке.',
  slow:
    'Хост не отвечает. Проверьте, что партия у хоста открыта. Если открыта — ваши сети не пропускают ' +
    'прямое соединение (так бывает с мобильным интернетом и рабочими сетями): попробуйте другую сеть.',
  online: 'Онлайн: связь с хостом есть',
  reconnecting: 'Связь с хостом потеряна — переподключение…',
} as const;

/** Гость: состояние связи с хостом. */
function GuestStatus() {
  const { guestLink, rejectMessage } = useOnline();
  return <span className={styles.invites}>{rejectMessage ?? GUEST_LINK_TEXT[guestLink]}</span>;
}

/** Гость открыл ссылку: ждём первый снимок от хоста. */
function Joining() {
  const { guestLink, rejectMessage } = useOnline();
  return (
    <section className={styles.setup}>
      <h1>Вампирская игра</h1>
      <p>{rejectMessage ?? GUEST_LINK_TEXT[guestLink]}</p>
      <button onClick={leavePage}>На экран настройки</button>
    </section>
  );
}

/** Гость уходит из комнаты: тот же адрес без приглашения. */
function leavePage(): void {
  window.location.href = window.location.pathname;
}
