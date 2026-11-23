import { BOT_FACTORIES, type Bot } from '@vampire/bots';
import {
  applyAction,
  createGameWithEvents,
  getLegalActions,
  getObservation,
  type Action,
  type CombatPlay,
  type CombatStrength,
  type GameEvent,
  type GameState,
  type PlayerId,
  type RuleToggles,
} from '@vampire/core';
import type { RegionId } from '@vampire/data';
import { create } from 'zustand';
import { eventText } from './labels';

/** Кто сидит в кресле: человек или бот по имени из BOT_FACTORIES. */
export type Seat = 'human' | string;

interface LogLine {
  id: number;
  text: string;
}

/** Последний ход бота на поле: какие слоты (`локация:слот`) и участки (id или `citadel:регион`) он занял. */
export interface LastMove {
  player: number;
  slots: string[];
  plots: string[];
}

/** Что на поле изменил ход: размещения и постройки. */
function moveMarks(events: readonly GameEvent[]): { slots: string[]; plots: string[] } {
  const slots: string[] = [];
  const plots: string[] = [];
  for (const e of events) {
    if (e.type === 'workerPlaced') slots.push(`${e.location}:${e.slot}`);
    if (e.type === 'buildingBuilt') plots.push(e.plot ?? `citadel:${e.region}`);
  }
  return { slots, plots };
}

/** Итог боя региона для окна итогов: вскрытые жетоны, силы, победитель. */
export interface CombatReport {
  id: number;
  round: number;
  region: RegionId;
  plays: CombatPlay[];
  /** Силы без отступивших (как считает ядро). */
  strengths: CombatStrength[];
  winner: PlayerId | null;
}

/** Собрать итоги боёв из событий хода (жетоны вскрываются раньше, чем бой разрешается). */
function collectCombat(
  reports: CombatReport[],
  revealed: Partial<Record<RegionId, CombatPlay[]>>,
  round: number,
  events: readonly GameEvent[],
): { combatReports: CombatReport[]; revealed: Partial<Record<RegionId, CombatPlay[]>> } {
  let r = reports;
  let v = revealed;
  for (const e of events) {
    if (e.type === 'combatTokensRevealed') v = { ...v, [e.region]: e.plays };
    if (e.type === 'combatResolved' && e.strengths.length > 0) {
      r = [
        ...r,
        {
          id: reportId++,
          round,
          region: e.region,
          plays: v[e.region] ?? [],
          strengths: e.strengths,
          winner: e.winner,
        },
      ];
    }
    if (e.type === 'roundStarted') v = {};
  }
  return { combatReports: r, revealed: v };
}

/** Снимок до хода: к нему возвращает отмена. */
interface Snapshot {
  state: GameState;
  log: LogLine[];
  combatReports: CombatReport[];
  revealed: Partial<Record<RegionId, CombatPlay[]>>;
  /** Чей был ход: отмена откатывает до последнего хода человека. */
  byHuman: boolean;
}

interface GameStore {
  state: GameState | null;
  history: Snapshot[];
  seats: Seat[];
  bots: (Bot | null)[];
  log: LogLine[];
  error: string | null;
  /** Последний ход бота с размещением или постройкой — подсвечивается на поле. */
  lastMove: LastMove | null;
  /** Итоги боёв партии по порядку; окно показывает ещё не просмотренные. */
  combatReports: CombatReport[];
  /** Вскрытые жетоны боёв, которые ещё не разрешились. */
  revealed: Partial<Record<RegionId, CombatPlay[]>>;
  start(seats: Seat[], seed: number, rules?: Partial<RuleToggles>): void;
  act(action: Action, byHuman?: boolean): void;
  /** Отменить последний ход человека (и ходы ботов после него). */
  undo(): void;
  /** Откатить один любой ход (выход с экрана ошибки). */
  back(): void;
  canUndo(): boolean;
  /** Ход бота, если сейчас его очередь. Возвращает true, если ход сделан. */
  botStep(): boolean;
  reset(): void;
}

let lineId = 0;
let reportId = 0;
const MAX_LOG = 400;
const MAX_HISTORY = 500;

function appendLog(log: LogLine[], state: GameState, events: readonly GameEvent[]): LogLine[] {
  const lines = events.flatMap((e) => {
    const text = eventText(state, e);
    return text ? [{ id: lineId++, text }] : [];
  });
  return [...log, ...lines].slice(-MAX_LOG);
}

export const useGame = create<GameStore>((set, get) => ({
  state: null,
  history: [],
  seats: [],
  bots: [],
  log: [],
  error: null,
  lastMove: null,
  combatReports: [],
  revealed: {},

  start(seats, seed, rules = {}) {
    const { state, events } = createGameWithEvents({ playerCount: seats.length, rules }, seed);
    const bots = seats.map((seat, i) => {
      if (seat === 'human') return null;
      const factory = BOT_FACTORIES[seat];
      return factory ? factory(seed * 31 + i) : null;
    });
    set({
      state,
      seats,
      bots,
      log: appendLog([], state, events),
      error: null,
      history: [],
      lastMove: null,
      combatReports: [],
      revealed: {},
    });
  },

  act(action, byHuman = true) {
    const { state, log, history, combatReports, revealed } = get();
    if (!state) return;
    try {
      const r = applyAction(state, action);
      const actor = state.pending?.player;
      const marks = moveMarks(r.events);
      const moved = marks.slots.length + marks.plots.length > 0;
      set({
        ...(moved && !byHuman && actor !== undefined
          ? { lastMove: { player: actor, ...marks } }
          : {}),
        state: r.state,
        log: appendLog(log, r.state, r.events),
        error: null,
        ...collectCombat(combatReports, revealed, state.round, r.events),
        history: [...history, { state, log, byHuman, combatReports, revealed }].slice(-MAX_HISTORY),
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  botStep() {
    const { state, bots } = get();
    const player = state?.pending?.player;
    if (!state || player === undefined) return false;
    const bot = bots[player];
    if (!bot) return false;
    const action = bot.chooseAction(getObservation(state, player), getLegalActions(state));
    get().act(action, false);
    return true;
  },

  undo() {
    const history = [...get().history];
    while (history.length > 0) {
      const snap = history.pop()!;
      if (snap.byHuman) {
        set({
          state: snap.state,
          log: snap.log,
          combatReports: snap.combatReports,
          revealed: snap.revealed,
          history,
          error: null,
        });
        return;
      }
    }
  },

  back() {
    const history = [...get().history];
    const snap = history.pop();
    if (!snap) return;
    set({
      state: snap.state,
      log: snap.log,
      combatReports: snap.combatReports,
      revealed: snap.revealed,
      history,
      error: null,
    });
  },

  canUndo() {
    return get().history.some((h) => h.byHuman);
  },

  reset() {
    set({
      state: null,
      seats: [],
      bots: [],
      log: [],
      error: null,
      history: [],
      lastMove: null,
      combatReports: [],
      revealed: {},
    });
  },
}));

/**
 * Партия сохраняется в localStorage после каждого хода: после обновления страницы или ошибки
 * она продолжается с того же места. Боты пересоздаются по имени кресла.
 */
const SAVE_KEY = 'vampire-game-save';
const SAVE_HISTORY = 40;

try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) {
    const saved = JSON.parse(raw) as Pick<
      GameStore,
      'state' | 'seats' | 'log' | 'history' | 'combatReports' | 'revealed'
    >;
    if (saved.state) {
      const bots = saved.seats.map((seat, i) =>
        seat === 'human' ? null : (BOT_FACTORIES[seat]?.(saved.state!.round * 31 + i) ?? null),
      );
      useGame.setState({ ...saved, bots, error: null, lastMove: null });
    }
  }
} catch {
  // Испорченное сохранение — начинаем с экрана настройки.
}

useGame.subscribe((s) => {
  try {
    if (!s.state) {
      localStorage.removeItem(SAVE_KEY);
      return;
    }
    const { state, seats, log, combatReports, revealed } = s;
    const history = s.history.slice(-SAVE_HISTORY);
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ state, seats, log, history, combatReports, revealed }),
    );
  } catch {
    // Нет места или нет доступа — играем без сохранения.
  }
});
