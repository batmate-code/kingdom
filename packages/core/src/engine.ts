import { GAME, LOCATION_ORDER, type LocationId } from '@vampire/data';
import { produce } from 'immer';
import { applyCombatReward, resolveCombat } from './combat';
import { resolveConfig, type GameConfigInput } from './config';
import type { Ctx } from './context';
import { assertInvariants } from './invariants';
import { applyLocationChoice, locationChoices } from './locationActions';
import { applyPass, applyPlace, placementActions } from './placement';
import { randomInt, seedToState } from './rng';
import { endRound, placementTurn, startRound } from './round';
import type {
  Action,
  ApplyResult,
  Decision,
  GameEvent,
  GameState,
  LocationState,
  Observation,
  PlayerId,
  Task,
} from './types';

/** Решения, которые принимаются автоматически, если вариант всего один. */
const AUTO_RESOLVE: ReadonlySet<Decision['kind']> = new Set(['locationAction', 'combatReward']);

const TASKS: { [K in Task['t']]: (c: Ctx, task: Extract<Task, { t: K }>) => void } = {
  startRound: (c) => startRound(c),
  placementTurn: (c, task) => placementTurn(c, task.first),
  askLocationAction: (c, task) => {
    c.draft.pending = { kind: 'locationAction', player: task.player, context: task.context };
  },
  combat: (c, task) => resolveCombat(c, task.region),
  endRound: (c) => endRound(c),
};

function legalFor(state: GameState, decision: Decision): Action[] {
  switch (decision.kind) {
    case 'placement':
      return [...placementActions(state, decision.player), { type: 'pass' }];
    case 'locationAction':
      return locationChoices(state, decision.player, decision.context).map((choice) => ({
        type: 'locationAction',
        choice,
      }));
    case 'combatReward':
      return [{ type: 'combatReward', choice: 'influence' }];
  }
}

/** Выполнить решение текущего pending. Действие уже проверено на допустимость. */
function resolve(c: Ctx, action: Action): void {
  const decision = c.draft.pending;
  if (!decision) throw new Error('Партия не ждёт решения');
  c.draft.pending = null;
  switch (decision.kind) {
    case 'placement':
      if (action.type === 'place') applyPlace(c, decision.player, action);
      else if (action.type === 'pass') applyPass(c, decision.player);
      else throw new Error(`Ожидалось размещение, получено ${action.type}`);
      return;
    case 'locationAction':
      if (action.type !== 'locationAction') throw new Error(`Ожидалось действие локации`);
      applyLocationChoice(c, decision.player, decision.context, action.choice);
      return;
    case 'combatReward':
      if (action.type !== 'combatReward') throw new Error(`Ожидалась награда за бой`);
      applyCombatReward(c, decision.player, decision.region);
      return;
  }
}

/** Выполнять шаги партии, пока не потребуется решение игрока. */
function run(c: Ctx): void {
  for (;;) {
    const pending = c.draft.pending;
    if (pending) {
      if (AUTO_RESOLVE.has(pending.kind)) {
        const legal = legalFor(c.draft, pending);
        if (legal.length === 1) {
          resolve(c, legal[0] as Action);
          continue;
        }
      }
      return;
    }
    const task = c.draft.tasks.shift();
    if (!task) return;
    (TASKS[task.t] as (c: Ctx, t: Task) => void)(c, task);
  }
}

/** Сериализация с отсортированными ключами — для сравнения действий. */
function stableKey(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

export function createGame(input: GameConfigInput, seed: number): GameState {
  const config = resolveConfig(input);
  const n = config.playerCount;
  const locations = Object.fromEntries(
    LOCATION_ORDER.map((l) => [l, { professionToken: null, slot2Locked: false }]),
  ) as Record<LocationId, LocationState>;
  const initial: GameState = {
    config,
    round: 1,
    firstPlayer: 0,
    phase: 'placement',
    players: Array.from({ length: n }, () => ({
      resources: { ...GAME.startResources },
      influence: { forest: 0, valley: 0, city: 0 },
      passed: false,
    })),
    workers: Array.from({ length: n }, (_, owner) =>
      Array.from({ length: GAME.workersPerPlayer }, (_, i) => ({
        id: `p${owner}w${i}`,
        owner,
        profession: null,
        character: null,
        position: { kind: 'reserve' } as const,
      })),
    ).flat(),
    locations,
    lair: { stash: 0, visited: false },
    cityEntryRaisedRegions: [],
    firstToMax: {},
    powerTokens: [],
    placementCurrent: 0,
    tasks: [{ t: 'startRound' }],
    pending: null,
    rng: seedToState(seed),
  };
  return produce(initial, (draft) => {
    // Первый игрок в 1-м раунде — случайно [интерпретация в правилах].
    draft.firstPlayer = randomInt(draft, n);
    run({ draft, events: [] });
    if (draft.config.checkInvariants) assertInvariants(draft);
  });
}

export function getLegalActions(state: GameState): Action[] {
  return state.pending ? legalFor(state, state.pending) : [];
}

export function applyAction(state: GameState, action: Action): ApplyResult {
  const legal = getLegalActions(state);
  const key = stableKey(action);
  if (!legal.some((a) => stableKey(a) === key)) {
    throw new Error(`Недопустимое действие: ${key}`);
  }
  const events: GameEvent[] = [];
  const next = produce(state, (draft) => {
    const c: Ctx = { draft, events };
    resolve(c, action);
    run(c);
    if (draft.config.checkInvariants) assertInvariants(draft);
  });
  return { state: next, events };
}

/** Чей сейчас выбор (null — партия окончена). */
export function currentPlayer(state: GameState): PlayerId | null {
  return state.pending?.player ?? null;
}

export function isTerminal(state: GameState): boolean {
  return state.phase === 'gameOver';
}

/**
 * Наблюдение игрока собирается из явного списка открытых полей: новое поле состояния
 * не попадёт сюда, пока его сознательно не объявят открытым. Скрытые сейчас: rng, tasks.
 */
export function getObservation(state: GameState, player: PlayerId): Observation {
  return {
    viewer: player,
    config: state.config,
    round: state.round,
    firstPlayer: state.firstPlayer,
    phase: state.phase,
    players: state.players,
    workers: state.workers,
    locations: state.locations,
    lair: state.lair,
    cityEntryRaisedRegions: state.cityEntryRaisedRegions,
    firstToMax: state.firstToMax,
    powerTokens: state.powerTokens,
    placementCurrent: state.placementCurrent,
    pending: state.pending,
  };
}
