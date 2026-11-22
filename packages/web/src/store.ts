import { BOT_FACTORIES, type Bot } from '@vampire/bots';
import {
  applyAction,
  createGameWithEvents,
  getLegalActions,
  getObservation,
  type Action,
  type GameEvent,
  type GameState,
  type RuleToggles,
} from '@vampire/core';
import { create } from 'zustand';
import { eventText } from './labels';

/** Кто сидит в кресле: человек или бот по имени из BOT_FACTORIES. */
export type Seat = 'human' | string;

interface LogLine {
  id: number;
  text: string;
}

/** Снимок до хода: к нему возвращает отмена. */
interface Snapshot {
  state: GameState;
  log: LogLine[];
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
  start(seats: Seat[], seed: number, rules?: Partial<RuleToggles>): void;
  act(action: Action, byHuman?: boolean): void;
  /** Отменить последний ход человека (и ходы ботов после него). */
  undo(): void;
  canUndo(): boolean;
  /** Ход бота, если сейчас его очередь. Возвращает true, если ход сделан. */
  botStep(): boolean;
  reset(): void;
}

let lineId = 0;
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

  start(seats, seed, rules = {}) {
    const { state, events } = createGameWithEvents({ playerCount: seats.length, rules }, seed);
    const bots = seats.map((seat, i) => {
      if (seat === 'human') return null;
      const factory = BOT_FACTORIES[seat];
      return factory ? factory(seed * 31 + i) : null;
    });
    set({ state, seats, bots, log: appendLog([], state, events), error: null, history: [] });
  },

  act(action, byHuman = true) {
    const { state, log, history } = get();
    if (!state) return;
    try {
      const r = applyAction(state, action);
      set({
        state: r.state,
        log: appendLog(log, r.state, r.events),
        error: null,
        history: [...history, { state, log, byHuman }].slice(-MAX_HISTORY),
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
        set({ state: snap.state, log: snap.log, history, error: null });
        return;
      }
    }
  },

  canUndo() {
    return get().history.some((h) => h.byHuman);
  },

  reset() {
    set({ state: null, seats: [], bots: [], log: [], error: null, history: [] });
  },
}));
