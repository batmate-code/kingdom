import type { Resources } from './types';

/** Параметры партии. По решению автора они одинаковы для 2–4 игроков. */
export const GAME = {
  minPlayers: 2,
  maxPlayers: 4,
  rounds: 6,
  workersPerPlayer: 3,
  startResources: { gold: 2, blood: 0, ore: 0, compromat: 0 } satisfies Resources,
  /** Драфт: столько персонажей и профессий выкладывается в раунде. */
  draftCharacters: 5,
  draftProfessions: 5,
} as const;

/**
 * Эксперименты автора (23.11) со стартом и экономикой; включаются переключателями правил.
 * START_RESOURCE_VARIANTS — стартовые ресурсы вместо GAME.startResources (startResources).
 */
export const START_RESOURCE_VARIANTS = {
  blood2: { gold: 2, blood: 2, ore: 0, compromat: 0 },
} as const satisfies Record<string, Resources>;

/**
 * Эксперимент автора (23.11), переключатель draftSize = 'players': персонажей и профессий на
 * драфте — число игроков + extra. Профессии тянутся случайно из пула: copiesPerProfession жетонов
 * каждой профессии (5 × 6 = 30); сброшенная пара и невзятые после раунда профессии возвращаются в пул.
 */
export const DRAFT_BY_PLAYERS = { extra: 1, copiesPerProfession: 6 } as const;

export const DISPLACEMENT = {
  /** Компромат владельцу вытесненного рабочего. */
  compensation: 1,
  /** Компромат владельцу рабочего, вытесненного Палачом. */
  executionerCompensation: 1,
} as const;

export const HOSPITAL = {
  /** Скидка на содержание персонажа, если рабочий был в госпитале. */
  upkeepDiscount: 1,
} as const;

/** Конец раунда: столько руды добавляется в копилку Логова, если второй слот Логова никто не занял. */
export const LAIR_STASH_PER_ROUND = 1;
