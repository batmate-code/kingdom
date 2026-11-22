import { GAME } from '@vampire/data';

/**
 * Спорные и изменяемые правила. Значение по умолчанию — правило игры (ответ автора или текущее
 * решение по открытому вопросу из docs/open-questions.md). Другие значения — для экспериментов
 * с балансом в симуляторе.
 */
export interface RuleToggles {
  /** OQ-1 (закрыт, автор: да): можно занять локацию и не делать платный обмен. */
  locationActionOptional: boolean;
  /** OQ-2 (закрыт, автор: да): можно вытеснить своего рабочего. */
  allowDisplaceOwnWorker: boolean;
  /** OQ-5 (закрыт, автор: да): в Ратуше можно платить руду за влияние на полном треке. */
  cityHallAllowsFullTrack: boolean;
  /** OQ-6 (закрыт, автор: да): в Подполье можно оплатить копию, которую потом нечем выполнить. */
  copyAllowsUselessTarget: boolean;
  /** OQ-15 (закрыт, автор: нет): Палач может вытеснить рабочего и из второго слота. */
  executionerTargetsSecondSlot: boolean;
  /** OQ-16 (закрыт, автор: нет): Палач срабатывает и когда попадает в первый слот вытеснением. */
  executionerOnDisplacement: boolean;
  /** OQ-23 (закрыт, автор: да): жетон боя кладут, даже если в регионе нет соперников. */
  combatTokensWithoutOpponents: boolean;
  /** OQ-24 (закрыт, автор: нет): владелец жетона Комиссариата участвует в бою без своих рабочих в регионе. */
  commissariatWithoutWorkers: boolean;
  /** OQ-25 (закрыт, автор: да): Склеп даёт силу и за своего рабочего во втором слоте соседней локации. */
  cryptCountsSecondSlot: boolean;
  /** OQ-29 (закрыт, автор: нет): право стройки Канцелярии можно купить, когда строить не на что. */
  buildRightWithoutOptions: boolean;
  /**
   * Порядок эффектов при размещении: 'fixed' — персонаж → локация → профессия (OQ-21, автор);
   * 'free' — игрок сам выбирает, какой эффект разыграть следующим (эксперимент для баланса).
   */
  effectOrder: 'fixed' | 'free';
  /** Первый игрок 1-го раунда случайный (иначе — Игрок 1, ответ автора 22.11). Для симулятора. */
  randomFirstPlayer: boolean;
}

export interface GameConfig {
  playerCount: number;
  rounds: number;
  /** Проверять инварианты после каждого действия (режим разработки). */
  checkInvariants: boolean;
  rules: RuleToggles;
}

export interface GameConfigInput {
  playerCount?: number;
  rounds?: number;
  checkInvariants?: boolean;
  rules?: Partial<RuleToggles>;
}

/** Допустимые значения строковых переключателей (для проверки ввода в симуляторе и интерфейсе). */
export const RULE_CHOICES: Partial<Record<keyof RuleToggles, readonly string[]>> = {
  effectOrder: ['fixed', 'free'],
};

export const DEFAULT_RULES: RuleToggles = {
  locationActionOptional: true,
  allowDisplaceOwnWorker: true,
  cityHallAllowsFullTrack: true,
  copyAllowsUselessTarget: true,
  executionerTargetsSecondSlot: false,
  executionerOnDisplacement: false,
  combatTokensWithoutOpponents: true,
  commissariatWithoutWorkers: false,
  cryptCountsSecondSlot: true,
  buildRightWithoutOptions: false,
  effectOrder: 'fixed',
  randomFirstPlayer: false,
};

export function resolveConfig(input: GameConfigInput = {}): GameConfig {
  const playerCount = input.playerCount ?? 3;
  if (
    !Number.isInteger(playerCount) ||
    playerCount < GAME.minPlayers ||
    playerCount > GAME.maxPlayers
  ) {
    throw new Error(`Число игроков должно быть от ${GAME.minPlayers} до ${GAME.maxPlayers}`);
  }
  return {
    playerCount,
    rounds: input.rounds ?? GAME.rounds,
    checkInvariants: input.checkInvariants ?? true,
    rules: { ...DEFAULT_RULES, ...input.rules },
  };
}
