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

export const DISPLACEMENT = {
  /** Компромат владельцу вытесненного рабочего. */
  compensation: 1,
  /** Компромат владельцу рабочего, вытесненного Палачом. */
  executionerCompensation: 2,
} as const;

export const HOSPITAL = {
  /** Скидка на содержание персонажа, если рабочий был в госпитале. */
  upkeepDiscount: 1,
} as const;

/** Конец раунда: столько руды добавляется в копилку Логова, если туда никто не приходил. */
export const LAIR_STASH_PER_ROUND = 1;
