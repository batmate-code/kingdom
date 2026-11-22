import { BOT_FACTORIES, type Bot } from '@vampire/bots';
import {
  applyAction,
  createGameWithEvents,
  getLegalActions,
  getObservation,
  type Action,
  type GameEvent,
  type GameState,
} from '@vampire/core';
import { create } from 'zustand';
import { eventText } from './labels';

/** Кто сидит в кресле: человек или бот по имени из BOT_FACTORIES. */
export type Seat = 'human' | string;

interface LogLine {
  id: number;
  text: string;
}

interface GameStore {
  state: GameState | null;
  seats: Seat[];
  bots: (Bot | null)[];
  log: LogLine[];
  error: string | null;
  start(seats: Seat[], seed: number): void;
  act(action: Action): void;
  /** Ход бота, если сейчас его очередь. Возвращает true, если ход сделан. */
  botStep(): boolean;
  reset(): void;
}

let lineId = 0;
const MAX_LOG = 400;

function appendLog(log: LogLine[], state: GameState, events: readonly GameEvent[]): LogLine[] {
  const lines = events.flatMap((e) => {
    const text = eventText(state, e);
    return text ? [{ id: lineId++, text }] : [];
  });
  return [...log, ...lines].slice(-MAX_LOG);
}

export const useGame = create<GameStore>((set, get) => ({
  state: null,
  seats: [],
  bots: [],
  log: [],
  error: null,

  start(seats, seed) {
    const { state, events } = createGameWithEvents({ playerCount: seats.length }, seed);
    const bots = seats.map((seat, i) => {
      if (seat === 'human') return null;
      const factory = BOT_FACTORIES[seat];
      return factory ? factory(seed * 31 + i) : null;
    });
    set({ state, seats, bots, log: appendLog([], state, events), error: null });
  },

  act(action) {
    const { state, log } = get();
    if (!state) return;
    try {
      const r = applyAction(state, action);
      set({ state: r.state, log: appendLog(log, r.state, r.events), error: null });
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
    get().act(action);
    return true;
  },

  reset() {
    set({ state: null, seats: [], bots: [], log: [], error: null });
  },
}));
