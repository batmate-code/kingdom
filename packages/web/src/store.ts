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
  /** Последний ход бота с размещением или постройкой — подсвечивается на поле. */
  lastMove: LastMove | null;
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
  lastMove: null,

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
    });
  },

  act(action, byHuman = true) {
    const { state, log, history } = get();
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
    set({ state: null, seats: [], bots: [], log: [], error: null, history: [], lastMove: null });
  },
}));
