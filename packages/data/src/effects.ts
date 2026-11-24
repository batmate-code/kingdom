/**
 * Числа эффектов персонажей, Алхимика и вместимости слотов. Движок берёт их только отсюда:
 * правка цифры в правилах — правка одного места.
 */
export const CHARACTER_PARAMS = {
  /** Падальщик: кровь за каждого рабочего в госпитале. */
  // Автор 24.11: золото, кровь и компромат за каждого рабочего в госпитале.
  scavenger: { goldPerHospitalWorker: 1, bloodPerHospitalWorker: 1, compromatPerHospitalWorker: 1 },
  /** Доносчик: компромат из банка на карту. */
  snitch: { compromat: 1, onDisplaced: 2 }, // автор 24.11: +1 сразу, ещё 2 при вытеснении
  /** Кровосос. */
  bloodsucker: { blood: 1 },
  /** Мародёр: золото за каждого вытесненного чужого рабочего. */
  marauder: { goldPerDisplaced: 3 }, // автор 24.11: было 2
  /** Летописец. */
  chronicler: { prestige: 3 }, // автор 24.11: было 2
  /** Баламут: жетоны силы в текущий регион. */
  troublemaker: { powerTokens: 1 },
  /** Кладовщик. */
  storekeeper: { gold: 2 }, // автор 24.11 (модель): 2 золота
  /** Казначей: compromatCost компромата → gold золота. */
  treasurer: { compromatCost: 1, gold: 4 }, // автор 24.11: было 3 — «супер слабый»
  /** Оборотень: жетоны силы, если у соперника сила больше на strengthGap и более. */
  werewolf: { strengthGap: 1, powerTokens: 2 }, // автор 24.11: отставание 1+
  /** Информатор: себе и каждому сопернику. */
  informant: { compromat: 1 }, // автор 24.11: только себе 1 (было 2 себе и по 1 соперникам)
  /** Манипулятор: −influenceLoss здесь, +influenceGain в другом регионе. */
  manipulator: { influenceLoss: 1, influenceGain: 1 }, // автор 24.11: только перенос
  /** Каменщик: золото за каждое своё здание региона, не больше maxGold. */
  mason: { goldPerBuilding: 2, maxGold: 4 }, // автор 24.11: было 1 и 3
  /** Карманник: золото у каждого соперника с рабочими в регионе. */
  pickpocket: { goldPerOpponent: 1 },
  /** Ренегат: −influenceLoss → ore руды или право стройки. */
  renegade: { influenceLoss: 1, ore: 3 }, // автор 24.11: 3 руды, без права стройки
  /** Офицер. */
  officer: { powerTokens: 2 },
  /** Дипломат. */
  diplomat: { influence: 1 }, // автор 24.11: только если в регионе есть рабочий соперника
  /** Рудокоп. */
  oreMiner: { ore: 1 },
  /** Шантажист: compromatCost компромата → забрать influence влияния у соперника. */
  blackmailer: { compromatCost: 3, influence: 1 }, // автор 24.11: 3 компромата
  /** Диверсант: золото за каждый снятый чужой жетон силы. */
  saboteur: { goldPerToken: 2 }, // автор 24.11: было 1
  /** Меценат: baseInfluence + perBuilding за каждое своё здание региона, не больше maxInfluence. */
  patron: { influence: 1, minBuildings: 2 }, // автор 24.11: +1, если 2+ своих здания в регионе
  /** Рудный барон: руда из банка на карту. */
  oreBaron: { ore: 2 }, // автор 24.11: без условия победы в бою
  /** Могильщик: руда за каждого отправленного в госпиталь. */
  gravedigger: { orePerWorker: 1 },
  /**
   * Наёмник (автор 24.11): powerTokens жетонов силы на карту за срабатывание, на карте не больше
   * maxTokens; копятся между раундами, выкладываются перед боем региона с твоим рабочим.
   */
  mercenary: { powerTokens: 1, maxTokens: 3 }, // автор 24.11: до 3, только в бой своего региона
  /** Латник (автор 24.11): компромат при размещении. */
  armorer: { locationActions: 2 }, // автор 24.11: действие локации дважды (было +1 компромат)
} as const;

/** Алхимик: раз за действие oreReplaced руды цены заменяется goldInstead золота. */
export const ALCHEMY = { oreReplaced: 1, goldInstead: 1 } as const;

/** Вместимость слотов: второй рабочий в первом слоте — только через Лазутчика. */
export const SLOT_CAPACITY = { first: 1, second: 1, firstWithInfiltrator: 2 } as const;
