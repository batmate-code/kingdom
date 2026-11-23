import { BOT_FACTORIES, type Bot } from '@vampire/bots';
import {
  applyAction,
  createGame,
  createGameWithEvents,
  findInvariantViolations,
  getLegalActions,
  getObservation,
  getScores,
  isTerminal,
  type Action,
  type GameConfigInput,
  type GameState,
  type PlayerScore,
} from '@vampire/core';

/** Запись партии: по ней партию можно воспроизвести целиком. */
import {
  StatsCollector,
  emptyAggregate,
  mergeStats,
  type AggregateStats,
  type GameStats,
} from './stats';

export interface GameRecord {
  config: GameConfigInput;
  seed: number;
  bots: string[];
  botSeeds: number[];
  actions: Action[];
}

export interface GameResult {
  seed: number;
  playerCount: number;
  bots: string[];
  /** Ходов (решений) за партию. */
  actions: number;
  ms: number;
  scores: PlayerScore[];
  /** Игроки на первом месте (несколько — ничья). */
  winners: number[];
  error: string | null;
  /** Есть только у партий с ошибкой. */
  record?: GameRecord;
  /** Статистика партии (если собиралась). */
  stats?: GameStats;
}

/** Предел ходов на партию: если превышен — движок зациклился. */
export const MAX_ACTIONS_PER_GAME = 20_000;

/** Seed бота кресла: детерминированно из seed партии. */
export function botSeed(gameSeed: number, seat: number): number {
  return (Math.imul(gameSeed, 0x9e3779b1) ^ Math.imul(seat + 1, 0x85ebca6b)) | 0;
}

export function makeBots(names: readonly string[], gameSeed: number): Bot[] {
  return names.map((name, seat) => {
    const factory = BOT_FACTORIES[name];
    if (!factory) throw new Error(`Неизвестный бот: ${name}`);
    return factory(botSeed(gameSeed, seat));
  });
}

/**
 * Сыграть одну партию ботами. Ошибка движка не роняет прогон: партия возвращается с текстом
 * ошибки и полной записью ходов (запись хранится только у партий с ошибкой — экономия памяти).
 * Партия детерминирована: те же config, seed и боты дают те же ходы. `checkEvery` — проверять инварианты каждые N ходов
 * (0 — только в конце партии); проверку после каждого хода включает config.checkInvariants.
 */
export function playRecordedGame(
  config: GameConfigInput,
  seed: number,
  botNames: readonly string[],
  checkEvery = 0,
  collectStats = false,
): GameResult {
  return playWithBots(config, seed, makeBots(botNames, seed), botNames, checkEvery, collectStats);
}

/** То же с готовыми ботами (имена — для отчёта). */
export function playWithBots(
  config: GameConfigInput,
  seed: number,
  bots: readonly Bot[],
  botNames: readonly string[],
  checkEvery = 0,
  collectStats = false,
): GameResult {
  const started = performance.now();
  const collector = collectStats ? new StatsCollector() : null;
  const actions: Action[] = [];
  let state: GameState | null = null;
  let error: string | null = null;
  try {
    const created = createGameWithEvents(config, seed);
    state = created.state;
    collector?.onEvents(created.events, state);
    while (!isTerminal(state)) {
      if (actions.length >= MAX_ACTIONS_PER_GAME) throw new Error('Превышен предел ходов');
      const current: GameState = state;
      const player: number | undefined = current.pending?.player;
      if (player === undefined) throw new Error('Партия не окончена, но никто не ходит');
      const bot: Bot | undefined = bots[player];
      if (!bot) throw new Error(`Нет бота для кресла ${player}`);
      const action: Action = bot.chooseAction(
        getObservation(current, player),
        getLegalActions(current),
      );
      actions.push(action);
      const applied = applyAction(current, action);
      state = applied.state;
      collector?.onEvents(applied.events, state);
      if (checkEvery > 0 && actions.length % checkEvery === 0) assertValid(state);
    }
    assertValid(state);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const scores = state && !error ? getScores(state) : [];
  const result: GameResult = {
    seed,
    playerCount: botNames.length,
    bots: [...botNames],
    actions: actions.length,
    ms: performance.now() - started,
    scores,
    winners: scores.filter((s) => s.rank === 1).map((s) => s.player),
    error,
  };
  if (collector && state && !error) result.stats = collector.finish(state);
  if (error) {
    result.record = {
      config,
      seed,
      bots: [...botNames],
      botSeeds: botNames.map((_, seat) => botSeed(seed, seat)),
      actions,
    };
  }
  return result;
}

function assertValid(state: GameState): void {
  const violations = findInvariantViolations(state);
  if (violations.length > 0) throw new Error(`Нарушены инварианты: ${violations.join('; ')}`);
}

/** Воспроизвести партию по записи (для разбора ошибок). */
export function replay(record: GameRecord): GameState {
  let state = createGame(record.config, record.seed);
  for (const a of record.actions) state = applyAction(state, a).state;
  return state;
}

export interface SimulationOptions {
  games: number;
  /** Боты по креслам; длина задаёт число игроков. */
  bots: string[];
  baseSeed: number;
  rules?: GameConfigInput['rules'];
  /** Колода персонажей (прогоны баланса); по умолчанию — все. */
  characterPool?: GameConfigInput['characterPool'];
  /** Проверка инвариантов после каждого хода (медленно). */
  checkEveryAction?: boolean;
  /** Проверка инвариантов каждые N ходов (по умолчанию только в конце партии). */
  checkEvery?: number;
  /** Собирать статистику локаций, персонажей и ресурсов. */
  collectStats?: boolean;
  onResult?: (result: GameResult, index: number) => void;
}

export interface SimulationSummary {
  games: number;
  errors: number;
  draws: number;
  totalMs: number;
  /** Доля побед (с учётом ничьих: победа делится между ничейными) по креслам. */
  winRateBySeat: number[];
  avgVp: number;
  avgActions: number;
}

/** Прогнать N партий подряд: seed партии = baseSeed + номер. */
export function runSimulation(opts: SimulationOptions): {
  results: GameResult[];
  summary: SimulationSummary;
  stats: AggregateStats | null;
} {
  const config: GameConfigInput = {
    playerCount: opts.bots.length,
    checkInvariants: opts.checkEveryAction ?? false,
    ...(opts.rules ? { rules: opts.rules } : {}),
    ...(opts.characterPool ? { characterPool: opts.characterPool } : {}),
  };
  const results: GameResult[] = [];
  const stats = opts.collectStats ? emptyAggregate() : null;
  for (let i = 0; i < opts.games; i++) {
    const r = playRecordedGame(
      config,
      opts.baseSeed + i,
      opts.bots,
      opts.checkEvery ?? 0,
      opts.collectStats ?? false,
    );
    if (stats && r.stats) {
      mergeStats(stats, r.stats);
      delete r.stats; // по партиям не храним — память
    }
    results.push(r);
    opts.onResult?.(r, i);
  }
  return { results, summary: summarize(results, opts.bots.length), stats };
}

export function summarize(results: readonly GameResult[], seats: number): SimulationSummary {
  const ok = results.filter((r) => !r.error);
  const wins = Array.from({ length: seats }, () => 0);
  let vp = 0;
  for (const r of ok) {
    for (const w of r.winners) wins[w] = (wins[w] ?? 0) + 1 / r.winners.length;
    vp += r.scores.reduce((s, x) => s + x.vp, 0) / Math.max(1, r.scores.length);
  }
  return {
    games: results.length,
    errors: results.length - ok.length,
    draws: ok.filter((r) => r.winners.length > 1).length,
    totalMs: results.reduce((s, r) => s + r.ms, 0),
    winRateBySeat: wins.map((w) => (ok.length ? w / ok.length : 0)),
    avgVp: ok.length ? vp / ok.length : 0,
    avgActions: ok.length ? ok.reduce((s, r) => s + r.actions, 0) / ok.length : 0,
  };
}

/** CSV: одна строка на партию; ПО и места по креслам в отдельных столбцах. */
export function toCsv(results: readonly GameResult[]): string {
  const seats = results.reduce((m, r) => Math.max(m, r.playerCount), 0);
  const header = [
    'seed',
    'players',
    'actions',
    'ms',
    'winners',
    'error',
    ...Array.from({ length: seats }, (_, i) => [
      `bot${i}`,
      `vp${i}`,
      `prestige${i}`,
      `rank${i}`,
    ]).flat(),
  ];
  const esc = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = results.map((r) => [
    String(r.seed),
    String(r.playerCount),
    String(r.actions),
    r.ms.toFixed(1),
    r.winners.join(' '),
    esc(r.error ?? ''),
    ...Array.from({ length: seats }, (_, i) => {
      const s = r.scores.find((x) => x.player === i);
      return [
        r.bots[i] ?? '',
        String(s?.vp ?? ''),
        String(s?.prestige ?? ''),
        String(s?.rank ?? ''),
      ];
    }).flat(),
  ]);
  return [header, ...rows].map((row) => row.join(',')).join('\n') + '\n';
}

/** Сыграть одну партию ботами (короткий вызов для тестов). */
export function playGame(config: GameConfigInput, seed: number, bots: readonly Bot[]): GameState {
  let state = createGame(config, seed);
  while (!isTerminal(state)) {
    const player = state.pending?.player;
    if (player === undefined) throw new Error('Партия не окончена, но никто не ходит');
    const bot = bots[player];
    if (!bot) throw new Error(`Нет бота для кресла ${player}`);
    state = applyAction(
      state,
      bot.chooseAction(getObservation(state, player), getLegalActions(state)),
    ).state;
  }
  return state;
}
