/**
 * Числа эффектов персонажей, Алхимика и вместимости слотов. Движок берёт их только отсюда:
 * правка цифры в правилах — правка одного места.
 */
export const CHARACTER_PARAMS = {
  /** Падальщик: кровь за каждого рабочего в госпитале. */
  scavenger: { bloodPerHospitalWorker: 1, compromatPerHospitalWorker: 1 }, // автор 24.11: и компромат
  /** Доносчик: компромат из банка на карту. */
  snitch: { compromat: 2 } /* автор 24.11: было 1 */,
  /** Кровосос. */
  bloodsucker: { blood: 1 },
  /** Мародёр: золото за каждого вытесненного чужого рабочего. */
  marauder: { goldPerDisplaced: 2 },
  /** Летописец. */
  chronicler: { prestige: 2 },
  /** Баламут: жетоны силы в текущий регион. */
  troublemaker: { powerTokens: 1 },
  /** Кладовщик. */
  storekeeper: { gold: 3 }, // автор 24.11: было 2
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
  renegade: { influenceLoss: 1, ore: 2 }, // автор 24.11: было 1
  /** Офицер. */
  officer: { powerTokens: 2 },
  /** Дипломат. */
  diplomat: { influence: 1 },
  /** Рудокоп. */
  oreMiner: { ore: 1 },
  /** Шантажист: compromatCost компромата → забрать influence влияния у соперника. */
  blackmailer: { compromatCost: 1, influence: 1 }, // автор 24.11: было 2
  /** Диверсант: золото за каждый снятый чужой жетон силы. */
  saboteur: { goldPerToken: 2 }, // автор 24.11: было 1
  /** Меценат: baseInfluence + perBuilding за каждое своё здание региона, не больше maxInfluence. */
  patron: { baseInfluence: 0, perBuilding: 1, maxInfluence: 2 }, // автор 24.11: без базового +1, максимум 2
  /** Рудный барон: руда из банка на карту. */
  oreBaron: { ore: 2 },
  /** Могильщик: руда за каждого отправленного в госпиталь. */
  gravedigger: { orePerWorker: 1 },
  /**
   * Наёмник (автор 24.11): powerTokens жетонов силы на карту за срабатывание, на карте не больше
   * maxTokens; копятся между раундами, выкладываются перед боем региона с твоим рабочим.
   */
  mercenary: { powerTokens: 1, maxTokens: 3 }, // автор 24.11: до 3, только в бой своего региона
  /** Латник (автор 24.11): компромат при размещении. */
  armorer: { compromat: 1 },
} as const;

/** Алхимик: раз за действие oreReplaced руды цены заменяется goldInstead золота. */
export const ALCHEMY = { oreReplaced: 1, goldInstead: 1 } as const;

/** Вместимость слотов: второй рабочий в первом слоте — только через Лазутчика. */
export const SLOT_CAPACITY = { first: 1, second: 1, firstWithInfiltrator: 2 } as const;
