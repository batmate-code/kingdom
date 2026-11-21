/**
 * Числа эффектов персонажей, Алхимика и вместимости слотов. Движок берёт их только отсюда:
 * правка цифры в правилах — правка одного места.
 */
export const CHARACTER_PARAMS = {
  /** Падальщик: кровь за каждого рабочего в госпитале. */
  scavenger: { bloodPerHospitalWorker: 1 },
  /** Доносчик: компромат из банка на карту. */
  snitch: { compromat: 1 },
  /** Кровосос. */
  bloodsucker: { blood: 1 },
  /** Мародёр: золото за каждого вытесненного чужого рабочего. */
  marauder: { goldPerDisplaced: 2 },
  /** Летописец. */
  chronicler: { prestige: 2 },
  /** Баламут: жетоны силы в текущий регион. */
  troublemaker: { powerTokens: 1 },
  /** Кладовщик. */
  storekeeper: { gold: 2 },
  /** Казначей: compromatCost компромата → gold золота. */
  treasurer: { compromatCost: 1, gold: 3 },
  /** Оборотень: жетоны силы, если у соперника сила больше на strengthGap и более. */
  werewolf: { strengthGap: 2, powerTokens: 2 },
  /** Информатор: себе и каждому сопернику. */
  informant: { compromat: 2, opponentsCompromat: 1 },
  /** Манипулятор: −influenceLoss здесь, +influenceGain в другом регионе. */
  manipulator: { influenceLoss: 1, influenceGain: 2 },
  /** Каменщик: золото за каждое своё здание региона, не больше maxGold. */
  mason: { goldPerBuilding: 1, maxGold: 3 },
  /** Карманник: золото у каждого соперника с рабочими в регионе. */
  pickpocket: { goldPerOpponent: 1 },
  /** Ренегат: −influenceLoss → ore руды или право стройки. */
  renegade: { influenceLoss: 1, ore: 1 },
  /** Офицер. */
  officer: { powerTokens: 2 },
  /** Дипломат. */
  diplomat: { influence: 1 },
  /** Рудокоп. */
  oreMiner: { ore: 1 },
  /** Шантажист: compromatCost компромата → забрать influence влияния у соперника. */
  blackmailer: { compromatCost: 2, influence: 1 },
  /** Диверсант: золото за каждый снятый чужой жетон силы. */
  saboteur: { goldPerToken: 1 },
  /** Меценат: baseInfluence + perBuilding за каждое своё здание региона, не больше maxInfluence. */
  patron: { baseInfluence: 1, perBuilding: 1, maxInfluence: 3 },
  /** Рудный барон: руда из банка на карту. */
  oreBaron: { ore: 2 },
  /** Могильщик: руда за каждого отправленного в госпиталь. */
  gravedigger: { orePerWorker: 1 },
} as const;

/** Алхимик: раз за действие oreReplaced руды цены заменяется goldInstead золота. */
export const ALCHEMY = { oreReplaced: 1, goldInstead: 1 } as const;

/** Вместимость слотов: второй рабочий в первом слоте — только через Лазутчика. */
export const SLOT_CAPACITY = { first: 1, second: 1, firstWithInfiltrator: 2 } as const;
