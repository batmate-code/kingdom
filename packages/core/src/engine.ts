import {
  CHARACTER_ORDER,
  COMBAT_TOKENS,
  COMBAT_TOKEN_ORDER,
  GAME,
  LOCATION_ORDER,
  type CombatTokenId,
  type LocationId,
} from '@vampire/data';
import { produce } from 'immer';
import { buildOptions } from './buildings';
import { startCharacterEffect } from './characters';
import { chooseEffect, professionEffect } from './placement';
import { combatOutcome, revealCombat, startCombat, startSpyMoves } from './combat';
import { resolveConfig, type GameConfigInput } from './config';
import type { Ctx } from './context';
import { assertInvariants } from './invariants';
import { autoResolves, legalFor, resolve } from './decisions';
import { randomInt, seedToState, shuffleInPlace } from './rng';
import { draftOptions, upgradeOptions } from './draft';
import { finishRound, placementTurn, startRound } from './round';
import { startUpkeep } from './upkeep';
import type {
  Action,
  ApplyResult,
  GameEvent,
  GameState,
  LocationState,
  Observation,
  PlayerId,
  Task,
} from './types';

const TASKS: { [K in Task['t']]: (c: Ctx, task: Extract<Task, { t: K }>) => void } = {
  startRound: (c) => startRound(c),
  placementTurn: (c, task) => placementTurn(c, task.first),
  askLocationAction: (c, task) => {
    // Страховка: рабочего, не доигравшего ход, убрать с поля нельзя (OQ-44), но если его
    // всё же нет в слоте — действия нет.
    const w = c.draft.workers.find((x) => x.id === task.context.workerId);
    if (w?.position.kind !== 'slot') return;
    c.draft.pending = { kind: 'locationAction', player: task.player, context: task.context };
  },
  spyMoves: (c) => startSpyMoves(c),
  askSpyMove: (c, task) => {
    c.draft.pending = { kind: 'spyMove', player: task.player, workerId: task.workerId };
  },
  combat: (c, task) => startCombat(c, task.region),
  askCombatToken: (c, task) => {
    c.draft.pending = { kind: 'combatToken', player: task.player, region: task.region };
  },
  revealCombat: (c, task) => revealCombat(c, task.region),
  askRetreat: (c, task) => {
    c.draft.pending = { kind: 'retreat', player: task.player, region: task.region };
  },
  combatOutcome: (c, task) => combatOutcome(c, task.region),
  characterEffect: (c, task) => startCharacterEffect(c, task.player, task.workerId),
  chooseEffect: (c, task) => chooseEffect(c, task),
  professionEffect: (c, task) => professionEffect(c, task.player, task.workerId, task.directSlot1),
  askBuild: (c, task) => {
    // Строить нечего — право сгорает без решения.
    if (buildOptions(c.draft, task.player, task.source).length === 0) return;
    c.draft.pending = { kind: 'build', player: task.player, source: task.source };
  },
  askDraft: (c, task) => {
    // Если выбирать нечего (колода кончилась при нестандартном числе раундов) — шаг пропускается.
    if (draftOptions(c.draft, task.player, task.circle).length === 0) return;
    c.draft.phase = 'draft';
    c.draft.pending = { kind: 'draftPick', player: task.player, circle: task.circle };
  },
  askUpgrade: (c, task) => {
    if (upgradeOptions(c.draft, task.player).length === 0) return;
    c.draft.phase = 'upgrade';
    c.draft.pending = { kind: 'upgrade', player: task.player };
  },
  askExecutioner: (c, task) => {
    c.draft.pending = { kind: 'executioner', player: task.player, workerId: task.workerId };
  },
  startUpkeep: (c) => startUpkeep(c),
  askUpkeep: (c, task) => {
    c.draft.pending = { kind: 'upkeep', player: task.player, workerId: task.workerId };
  },
  finishRound: (c) => finishRound(c),
};

/** Выполнять шаги партии, пока не потребуется решение игрока. */
function run(c: Ctx): void {
  for (;;) {
    const pending = c.draft.pending;
    if (pending) {
      if (autoResolves(pending)) {
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

/** Счётчик по каждому виду жетона боя. */
function tokenRecord(count: (t: CombatTokenId) => number): Record<CombatTokenId, number> {
  return COMBAT_TOKEN_ORDER.reduce<Partial<Record<CombatTokenId, number>>>(
    (acc, t) => ({ ...acc, [t]: count(t) }),
    {},
  ) as Record<CombatTokenId, number>;
}

/** Создать партию и получить события её начала (выкладка 1-го раунда и т. п.). */
export function createGameWithEvents(input: GameConfigInput, seed: number): ApplyResult {
  const config = resolveConfig(input);
  const n = config.playerCount;
  const locations = Object.fromEntries(
    LOCATION_ORDER.map((l) => [l, { professionToken: null, slot2Locked: false }]),
  ) as Record<LocationId, LocationState>;
  const initial: GameState = {
    config,
    round: 1,
    firstPlayer: 0,
    phase: 'draft',
    players: Array.from({ length: n }, () => ({
      resources: { ...GAME.startResources },
      influence: { forest: 0, valley: 0, city: 0 },
      prestige: 0,
      passed: false,
      draftPick: { character: null, profession: null },
      combatTokens: {
        hand: tokenRecord((t) => COMBAT_TOKENS[t].count),
        discard: tokenRecord(() => 0),
      },
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
    lair: { stash: 0, slot2Taken: false },
    cityEntryRaisedRegions: [],
    firstToMax: {},
    powerTokens: [],
    commissariat: null,
    buildings: [],
    combat: null,
    combatWinners: {},
    cardStash: [],
    blocks: [],
    alchemy: null,
    placementCurrent: 0,
    deck: [...CHARACTER_ORDER],
    discard: [],
    offer: { characters: [], professions: [] },
    tasks: [{ t: 'startRound' }],
    pending: null,
    rng: seedToState(seed),
  };
  const events: GameEvent[] = [];
  const state = produce(initial, (draft) => {
    // Первый игрок в 1-м раунде — случайно [интерпретация в правилах].
    draft.firstPlayer = randomInt(draft, n);
    shuffleInPlace(draft, draft.deck);
    run({ draft, events });
    if (draft.config.checkInvariants) assertInvariants(draft);
  });
  return { state, events };
}

export function createGame(input: GameConfigInput, seed: number): GameState {
  return createGameWithEvents(input, seed).state;
}

export function getLegalActions(state: GameState): Action[] {
  return state.pending ? legalFor(state, state.pending) : [];
}

/**
 * Применить действие. `validate: false` — без проверки допустимости: только для ботов,
 * которые берут действие из getLegalActions того же состояния (перебор вариантов).
 */
export function applyAction(
  state: GameState,
  action: Action,
  opts: { validate?: boolean } = {},
): ApplyResult {
  if (opts.validate !== false) {
    const legal = getLegalActions(state);
    const key = stableKey(action);
    if (!legal.some((a) => stableKey(a) === key)) {
      throw new Error(`Недопустимое действие: ${key}`);
    }
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
 * не попадёт сюда, пока его сознательно не объявят открытым. Скрытые сейчас: rng,
 * порядок колоды (виден только её размер), чужие жетоны боя до вскрытия. Очередь шагов открыта:
 * в ней только порядок предстоящих решений, без скрытых данных (нужна ботам для перебора).
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
    commissariat: state.commissariat,
    buildings: state.buildings,
    combat: state.combat && {
      region: state.combat.region,
      revealed: state.combat.revealed,
      plays: state.combat.plays.map(({ player: p, token }) => ({
        player: p,
        token: state.combat?.revealed || p === player ? token : null,
      })),
    },
    combatWinners: state.combatWinners,
    cardStash: state.cardStash,
    blocks: state.blocks,
    alchemy: state.alchemy,
    placementCurrent: state.placementCurrent,
    deckSize: state.deck.length,
    discard: state.discard,
    offer: state.offer,
    tasks: state.tasks,
    pending: state.pending,
  };
}
