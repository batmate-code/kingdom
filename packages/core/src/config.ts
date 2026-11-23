import { CHARACTER_ORDER, GAME, type CharacterId } from '@vampire/data';

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
  /**
   * OQ-16: Палач срабатывает и когда попадает в первый слот вытеснением из второго (выбивает двоих).
   * Было «нет»; автор изменил правило 23.11 — да.
   */
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
  /**
   * Доплата за двойной участок: 'ore' — правило автора по умолчанию (Лес/Долина +1 руда, Город
   * +1 компромат, PLOT_SURCHARGE_VARIANTS; прогоны docs/stats/2026-11-22-mixed);
   * 'base' — прежнее (Лес/Долина +2 золота, Город +1 руда, как на картоне PLOTS).
   */
  plotSurcharge: 'base' | 'ore';
  /**
   * Месса, обмен крови на золото: 'weak' — прежний эксперимент автора (22.11, хуже на
   * MASS_WEAK_BLOOD_TO_GOLD_PENALTY (1 → 2 и 1 → 1), золото → кровь как было; 'base' — прежнее (1 → 3 и 1 → 2).
   */
  massBloodToGold: 'base' | 'weak';
  /** Цена Цитадели: 'cheap' — правило автора по умолчанию (22.11, CITADEL_COST_CHEAP); 'base' — прежнее (7 золота, 3 руды). */
  citadelCost: 'base' | 'cheap';
  /** Стартовые ресурсы: 'base' — GAME.startResources (2 золота); 'blood2' — ещё +2 крови. */
  startResources: 'base' | 'blood2';
  /**
   * Чем платят вход в Город: 'mixed' — база кровью, подорожания золотом (правило автора по умолчанию,
   * прогоны docs/stats/2026-11-22-mixed); 'blood' — целиком кровью; 'gold' — целиком золотом (прежние).
   */
  cityEntryResource: 'gold' | 'blood' | 'mixed';
  /** Бонусы за позиции треков влияния (TRACK_BOOSTS): правило автора с 23.11; false — прежнее. */
  trackBoosts: boolean;
  /**
   * Жетоны профессий локаций раскладываются один раз в начале партии (правило автора с 23.11);
   * false — заново каждый раунд (прежнее).
   */
  professionTokensOnce: boolean;
  /**
   * Размер драфта: 'fixed' — 5 персонажей и 5 профессий, по одной каждой (правила);
   * 'players' — эксперимент автора 23.11: игроков + 1 персонажей и столько же случайных профессий.
   */
  draftSize: 'fixed' | 'players';
  /**
   * Набор жетонов боя: 'base' — 10 жетонов (Приманок 5), возврат после 3-го раунда (правила);
   * 'six' — эксперимент автора 23.11: по одному каждого вида, возврат каждые 2 раунда.
   */
  combatTokenSet: 'base' | 'six';
}

export interface GameConfig {
  playerCount: number;
  rounds: number;
  /** Проверять инварианты после каждого действия (режим разработки). */
  checkInvariants: boolean;
  rules: RuleToggles;
  /**
   * Колода персонажей для прогонов баланса (автор 23.11): только эти персонажи, продублированные
   * до полного размера колоды (см. characterDeck). null — все персонажи (правила).
   */
  characterPool: CharacterId[] | null;
}

export interface GameConfigInput {
  playerCount?: number;
  rounds?: number;
  checkInvariants?: boolean;
  rules?: Partial<RuleToggles>;
  characterPool?: readonly CharacterId[] | null;
}

/** Допустимые значения строковых переключателей (для проверки ввода в симуляторе и интерфейсе). */
export const RULE_CHOICES: Partial<Record<keyof RuleToggles, readonly string[]>> = {
  effectOrder: ['fixed', 'free'],
  plotSurcharge: ['base', 'ore'],
  massBloodToGold: ['base', 'weak'],
  citadelCost: ['base', 'cheap'],
  startResources: ['base', 'blood2'],
  cityEntryResource: ['gold', 'blood', 'mixed'],
  draftSize: ['fixed', 'players'],
  combatTokenSet: ['base', 'six'],
};

export const DEFAULT_RULES: RuleToggles = {
  locationActionOptional: true,
  allowDisplaceOwnWorker: true,
  cityHallAllowsFullTrack: true,
  copyAllowsUselessTarget: true,
  // Автор 23.11: Палач выбивает и из второго слота.
  executionerTargetsSecondSlot: true,
  executionerOnDisplacement: true,
  combatTokensWithoutOpponents: true,
  // Автор 23.11: жетон Комиссариата сам считается присутствием в регионе (раньше OQ-24: нет).
  commissariatWithoutWorkers: true,
  cryptCountsSecondSlot: true,
  buildRightWithoutOptions: false,
  effectOrder: 'fixed',
  randomFirstPlayer: false,
  plotSurcharge: 'ore',
  // Автор 23.11: Месса симметрична (2 → 5 и 1 → 1), ослабление крови → золота не нужно.
  massBloodToGold: 'base',
  citadelCost: 'cheap',
  startResources: 'base',
  cityEntryResource: 'mixed',
  trackBoosts: true,
  professionTokensOnce: true,
  draftSize: 'fixed',
  // Автор 23.11: 6 жетонов (по одному каждого вида), возврат каждые 2 раунда — по умолчанию.
  combatTokenSet: 'six',
};

/**
 * Состав колоды персонажей: все по одному (правила) или урезанный список прогона, повторённый
 * столько раз, чтобы карт было не меньше полной колоды (автор 23.11: «продублируй»).
 */
export function characterDeck(config: Pick<GameConfig, 'characterPool'>): CharacterId[] {
  const pool = config.characterPool;
  if (!pool || pool.length === 0) return [...CHARACTER_ORDER];
  const out: CharacterId[] = [];
  while (out.length < CHARACTER_ORDER.length) out.push(...pool);
  return out;
}

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
    characterPool: input.characterPool ? [...input.characterPool] : null,
  };
}
