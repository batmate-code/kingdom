import { BOT_FACTORIES, type Bot } from '@vampire/bots';
import {
  applyAction,
  createGameWithEvents,
  findInvariantViolations,
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
import { inviteFrom } from './online/invite';
import type { UndoVote } from './online/protocol';
import { newKey } from './online/keys';

/**
 * Кто сидит в кресле: человек за этим компьютером, гость по ссылке (онлайн, ходит через хоста),
 * remote — соперник на экране гостя (кто он, гость не знает) или бот по имени из BOT_FACTORIES.
 */
export type Seat = 'human' | 'guest' | 'remote' | string;

/** Онлайн, хост: комната и ключи кресел гостей (для ссылок-приглашений). */
export interface HostRoom {
  room: string;
  invites: { seat: number; key: string }[];
}

/** Онлайн, гость: своё кресло, номер снимка хоста и допустимые ходы из него. */
export interface GuestSeat {
  seat: number;
  seq: number;
  legal: Action[];
  /** Хост разрешает попросить отмену своего последнего хода. */
  canUndo: boolean;
}

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
  /** Кресло, которое ходило (онлайн: какой ход отменяет просьба игрока). */
  actor?: number | null;
}

/**
 * Онлайн-отмена: индекс снимка перед последним ходом кресла `seat` (-1 — такого хода нет или
 * история старая, без кресел ходов). Ходы после него откатываются тоже — с согласия всех.
 */
export function undoIndex(history: readonly Snapshot[], seat: number): number {
  for (let i = history.length - 1; i >= 0; i--) {
    const actor = history[i]!.actor;
    if (actor === undefined || actor === null) return -1;
    if (actor === seat) return i;
  }
  return -1;
}

export type { UndoVote } from './online/protocol';

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
  /** События последнего хода для тостов (у хоста — каждый ход, у гостя — каждый снимок). */
  feed: { id: number; events: GameEvent[] } | null;
  /** Растёт с каждым ходом; события этого хода — для рассылки гостям (online/connect.ts). */
  version: number;
  lastEvents: GameEvent[];
  /** Онлайн, хост: комната (null — партия только за этим компьютером). */
  hostRoom: HostRoom | null;
  /** Онлайн, гость: своё кресло (null — не гость). state у гостя — determinize снимка. */
  guest: GuestSeat | null;
  /** Онлайн, гость: отправить ход хосту (ставит online/connect.ts). */
  sendAction: ((action: Action) => void) | null;
  /** Онлайн, гость: попросить хоста отменить свой последний ход / ответить на просьбу. */
  sendUndo: (() => void) | null;
  sendUndoVote: ((id: number, accept: boolean) => void) | null;
  /** Онлайн: идущая просьба отменить ход (у хоста — с индексом снимка, у гостя — копия). */
  undoVote: (UndoVote & { index: number }) | null;
  /** Хост: можно ли креслу попросить отмену и сама просьба. */
  canRequestUndo(seat: number): boolean;
  requestUndo(seat: number): boolean;
  /** Хост: ответ кресел на просьбу (отказ любого — просьба снята; согласились все — откат). */
  voteUndo(seats: readonly number[], id: number, accept: boolean): void;
  /** Ответ на просьбу с этого экрана (хост — за своих людей, гость — через хоста). */
  answerUndo(accept: boolean): void;
  start(seats: Seat[], seed: number, rules?: Partial<RuleToggles>): void;
  /** Онлайн, гость: принять снимок хоста (уже в виде полного состояния) и его события. */
  loadSnapshot(state: GameState, events: readonly GameEvent[], guest: GuestSeat): void;
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
let undoVoteId = 0;
let feedId = 0;

/** Откат партии хоста к снимку истории (после согласия всех на отмену). */
function rollback(index: number): void {
  const { history, version } = useGame.getState();
  const snap = history[index];
  if (!snap) return;
  useGame.setState({
    state: snap.state,
    log: snap.log,
    combatReports: snap.combatReports,
    revealed: snap.revealed,
    history: history.slice(0, index),
    error: null,
    lastMove: null,
    undoVote: null,
    // Новая версия — гости получат снимок отменённой партии.
    version: version + 1,
    lastEvents: [],
  });
}
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
  feed: null,
  version: 0,
  lastEvents: [],
  hostRoom: null,
  guest: null,
  sendAction: null,
  sendUndo: null,
  sendUndoVote: null,
  undoVote: null,

  start(seats, seed, rules = {}) {
    const { state, events } = createGameWithEvents({ playerCount: seats.length, rules }, seed);
    const bots = seats.map((seat, i) => {
      if (seat === 'human') return null;
      const factory = BOT_FACTORIES[seat];
      return factory ? factory(seed * 31 + i) : null;
    });
    const invites = seats.flatMap((seat, i) =>
      seat === 'guest' ? [{ seat: i, key: newKey() }] : [],
    );
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
      version: get().version + 1,
      lastEvents: events,
      hostRoom: invites.length > 0 ? { room: newKey(), invites } : null,
      guest: null,
      sendAction: null,
      sendUndo: null,
    });
  },

  loadSnapshot(state, events, guest) {
    const { log, combatReports, revealed } = get();
    const marks = moveMarks(events);
    const actor = get().state?.pending?.player;
    set({
      state,
      guest,
      // Своё кресло — человек; кто в остальных (люди или боты хоста), гость не знает: remote.
      seats: state.players.map((_, i) => (i === guest.seat ? 'human' : 'remote')),
      log: appendLog(log, state, events),
      ...collectCombat(combatReports, revealed, state.round, events),
      ...(events.length > 0 ? { feed: { id: feedId++, events: [...events] } } : {}),
      ...(marks.slots.length + marks.plots.length > 0 && actor !== undefined && actor !== guest.seat
        ? { lastMove: { player: actor, ...marks } }
        : {}),
      error: null,
    });
  },

  act(action, byHuman = true) {
    const { state, log, history, combatReports, revealed, sendAction } = get();
    if (!state) return;
    // Гость: ход уходит хосту, партия обновится его снимком.
    if (sendAction) {
      sendAction(action);
      return;
    }
    try {
      const r = applyAction(state, action);
      const actor = state.pending?.player;
      // Новый ход снимает просьбу об отмене: откатилось бы не то, о чём спрашивали.
      if (get().undoVote) set({ undoVote: null });
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
        history: [
          ...history,
          { state, log, byHuman, combatReports, revealed, actor: actor ?? null },
        ].slice(-MAX_HISTORY),
        version: get().version + 1,
        lastEvents: r.events,
        feed: { id: feedId++, events: r.events },
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

  canRequestUndo(seat) {
    const { history, undoVote } = get();
    return undoVote === null && undoIndex(history, seat) >= 0;
  },

  requestUndo(seat) {
    const { history, log, seats, undoVote, version } = get();
    const index = undoIndex(history, seat);
    const snap = history[index];
    if (undoVote || !snap) return false;
    // Согласиться должны все живые игроки, кроме попросившего: люди за экраном хоста и гости.
    const need = seats.flatMap((s, i) =>
      i !== seat && (s === 'human' || s === 'guest') ? [i] : [],
    );
    if (need.length === 0) {
      rollback(index);
      return true;
    }
    const vote = {
      id: undoVoteId++,
      requester: seat,
      lines: log.slice(snap.log.length).map((l) => l.text),
      need,
      approved: [],
      index,
    };
    set({ undoVote: vote, version: version + 1, lastEvents: [] });
    return true;
  },

  voteUndo(voters, id, accept) {
    const { undoVote, version } = get();
    if (!undoVote || undoVote.id !== id) return;
    const relevant = voters.filter((v) => undoVote.need.includes(v) || v === undoVote.requester);
    if (relevant.length === 0) return;
    if (!accept) {
      set({ undoVote: null, version: version + 1, lastEvents: [] });
      return;
    }
    const approved = [...new Set([...undoVote.approved, ...relevant])].filter((v) =>
      undoVote.need.includes(v),
    );
    if (undoVote.need.every((n) => approved.includes(n))) {
      rollback(undoVote.index);
      return;
    }
    set({ undoVote: { ...undoVote, approved }, version: version + 1, lastEvents: [] });
  },

  answerUndo(accept) {
    const { guest, undoVote, sendUndoVote, seats } = get();
    if (!undoVote) return;
    if (guest) sendUndoVote?.(undoVote.id, accept);
    else get().voteUndo([...localSeats(seats)], undoVote.id, accept);
  },

  undo() {
    const { hostRoom, guest, sendUndo, seats } = get();
    // Онлайн: просьба отменить свой последний ход — откат после согласия всех игроков.
    if (guest) {
      if (guest.canUndo) sendUndo?.();
      return;
    }
    if (hostRoom) {
      // Из людей за экраном хоста — тот, кто ходил последним.
      const mine = localSeats(seats);
      const last = [...get().history].reverse().find((h) => h.actor != null && mine.has(h.actor));
      if (last?.actor != null) get().requestUndo(last.actor);
      return;
    }
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
    const { hostRoom, guest, seats, undoVote } = get();
    if (undoVote) return false;
    if (guest) return guest.canUndo;
    if (hostRoom) return [...localSeats(seats)].some((s) => get().canRequestUndo(s));
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
      lastEvents: [],
      hostRoom: null,
      guest: null,
      sendAction: null,
      sendUndo: null,
      sendUndoVote: null,
      undoVote: null,
    });
  },
}));

/** Кресла людей за этим экраном. */
function localSeats(seats: readonly Seat[]): Set<number> {
  return new Set(seats.flatMap((s, i) => (s === 'human' ? [i] : [])));
}

/**
 * Партия сохраняется в localStorage после каждого хода: после обновления страницы или ошибки
 * она продолжается с того же места. Боты пересоздаются по имени кресла.
 */
const SAVE_KEY = 'vampire-game-save';
/**
 * Версия формата сохранения: поднимать, когда меняется форма состояния партии или store, — старые
 * сохранения тогда отбрасываются (партия начинается с экрана настройки, а не падает).
 */
const SAVE_VERSION = 2;

/** Страница открыта по ссылке-приглашению (онлайн-гость). */
function isGuestPage(): boolean {
  return typeof window !== 'undefined' && inviteFrom(window.location) !== null;
}
const SAVE_HISTORY = 40;

try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) {
    const saved = JSON.parse(raw) as Pick<
      GameStore,
      'state' | 'seats' | 'log' | 'history' | 'combatReports' | 'revealed' | 'hostRoom'
    > & { saveVersion?: number; version?: number };
    // Сохранение подходит, если формат той же версии и партия цела по инвариантам ядра (правила
    // могли поменяться с тех пор, как её сохранили).
    const compatible =
      saved.saveVersion === SAVE_VERSION &&
      saved.state !== null &&
      findInvariantViolations(saved.state).length === 0;
    // Гость по ссылке не подхватывает своё сохранение: его партия — у хоста.
    if (compatible && saved.state && !isGuestPage()) {
      const bots = saved.seats.map((seat, i) =>
        seat === 'human' ? null : (BOT_FACTORIES[seat]?.(saved.state!.round * 31 + i) ?? null),
      );
      // Счётчики id продолжаются после перезагрузки: иначе новые итоги боёв получат id уже
      // просмотренных и окно итогов их не покажет.
      reportId = Math.max(reportId, ...saved.combatReports.map((r) => r.id + 1));
      lineId = Math.max(lineId, ...saved.log.map((l) => l.id + 1));
      useGame.setState({
        ...saved,
        hostRoom: saved.hostRoom ?? null,
        // Номер версии продолжается после перезагрузки: по нему хост нумерует снимки для гостей,
        // а гость отбрасывает снимки с меньшим номером.
        version: typeof saved.version === 'number' ? saved.version : 0,
        bots,
        error: null,
        lastMove: null,
      });
    }
  }
} catch {
  // Испорченное сохранение — начинаем с экрана настройки.
}

useGame.subscribe((s) => {
  try {
    // Гость не сохраняет и не стирает сохранение: его партия — у хоста (и сохранение этого
    // браузера может принадлежать вкладке хоста).
    if (s.guest || isGuestPage()) return;
    if (!s.state) {
      localStorage.removeItem(SAVE_KEY);
      return;
    }
    const { state, seats, log, combatReports, revealed, hostRoom, version } = s;
    const history = s.history.slice(-SAVE_HISTORY);
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        saveVersion: SAVE_VERSION,
        state,
        seats,
        log,
        history,
        combatReports,
        revealed,
        hostRoom: hostRoom ?? null,
        version,
      }),
    );
  } catch {
    // Нет места или нет доступа — играем без сохранения.
  }
});
