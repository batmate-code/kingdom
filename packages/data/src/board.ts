import type {
  LocationDef,
  LocationId,
  PlotDef,
  RegionDef,
  RegionId,
  Resources,
  TrackDef,
} from './types';

/** Регионы в порядке боёв: Лес → Долина → Город. */
export const REGIONS: readonly RegionDef[] = [
  { id: 'forest', name: 'Лес' },
  { id: 'valley', name: 'Долина' },
  { id: 'city', name: 'Город' },
];

export const REGION_ORDER: readonly RegionId[] = REGIONS.map((r) => r.id);

export const LOCATIONS: Readonly<Record<LocationId, LocationDef>> = {
  mine: {
    id: 'mine',
    name: 'Рудник',
    region: 'forest',
    slots: [
      { kind: 'gain', gain: { gold: 3 } },
      { kind: 'gain', gain: { gold: 2 } },
    ],
  },
  witchCircle: {
    id: 'witchCircle',
    name: 'Ведьмин круг',
    region: 'forest',
    slots: [
      { kind: 'gain', gain: { blood: 3 } },
      { kind: 'gain', gain: { blood: 2 } },
    ],
  },
  lair: {
    id: 'lair',
    name: 'Логово',
    region: 'forest',
    slots: [
      { kind: 'gain', gain: { ore: 1 } },
      // Ответ автора (22.11): 4 крови → 1 руда + копилка (OQ-46: обмен один раз).
      { kind: 'lairStash', bloodPerOre: 3, maxExchanges: 1 }, // автор 24.11: 3 крови (было 4)
    ],
  },
  mass: {
    id: 'mass',
    name: 'Месса',
    region: 'valley',
    slots: [
      // Автор 23.11: один обмен 2 → 5 и один обмен 1 → 2, в любую сторону (золото ↔ кровь).
      { kind: 'mass', unit: 2, rate: 6, maxTimes: 1 }, // автор 24.11: 2 → 6 (было 5)
      // Автор 24.11: второй слот — 1 жетон силы в любой регион.
      { kind: 'powerToken', count: 1 },
    ],
  },
  market: {
    id: 'market',
    name: 'Рынок',
    region: 'valley',
    slots: [
      // Автор 23.11: 2 руды за 2 (или 3) золота/крови в любом соотношении, продажи руды нет.
      { kind: 'market', ore: 2, buyCost: 2, sellGain: null },
      // Автор 24.11: второй слот — 1 компромат и 1 золото.
      { kind: 'gain', gain: { compromat: 1, gold: 1 } },
    ],
  },
  tavern: {
    id: 'tavern',
    name: 'Таверна',
    region: 'valley',
    slots: [{ kind: 'tavernSwap' }, { kind: 'gain', gain: { gold: 1, blood: 1 } }],
  },
  chancery: {
    id: 'chancery',
    name: 'Канцелярия',
    region: 'city',
    slots: [
      // Автор 23.11: до 2 действий — 1 компромат → 3 золота/крови, → 2 руды или → право стройки
      // (OQ-47: обмены повторяются, право стройки один раз); 2-й слот — право стройки за 2.
      {
        kind: 'chancery',
        maxActions: 2,
        conversionCost: 1,
        goldBlood: 3,
        // Автор 24.11: 2 компромата → 1 руда + 1 золото (было 1 → 2 руды).
        oreConversion: { compromat: 2, gain: { ore: 1, gold: 1 } },
        buildRightCost: 1,
      },
      { kind: 'chanceryBuild', compromatCost: 1 }, // автор 24.11: 1 компромат
    ],
  },
  underground: {
    id: 'underground',
    name: 'Подполье',
    region: 'city',
    slots: [
      // Автор 23.11: копирование бесплатно (было 1 золото).
      // Автор 24.11: первый слот копирует только Лес и Долину; второй — компромат → влияние.
      { kind: 'copy', goldCost: 0, scope: ['forest', 'valley'] },
      {
        kind: 'cityHall',
        // Автор 24.11: 3 компромата → 1 влияние или 5 → 2 (было 2 → 1).
        offers: [
          { cost: { compromat: 3 }, influence: 1 },
          { cost: { compromat: 5 }, influence: 2 },
        ],
      },
    ],
  },
  commissariat: {
    id: 'commissariat',
    name: 'Комиссариат',
    region: 'city',
    slots: [{ kind: 'commissariatToken' }, { kind: 'revive', cost: { compromat: 1 } }], // автор 24.11: 1 компромат
  },
  cityHall: {
    id: 'cityHall',
    name: 'Ратуша',
    region: 'city',
    slots: [
      {
        kind: 'cityHall',
        offers: [
          { cost: { ore: 1 }, influence: 1 },
          { cost: { ore: 3 }, influence: 2 },
        ],
      },
      {
        kind: 'cityHall',
        offers: [
          { cost: { ore: 2 }, influence: 1 },
          { cost: { ore: 4 }, influence: 2 },
        ],
      },
    ],
  },
};

/** Порядок локаций для раздачи жетонов профессий и перечисления действий. */
export const LOCATION_ORDER: readonly LocationId[] = [
  'mine',
  'witchCircle',
  'lair',
  'mass',
  'market',
  'tavern',
  'chancery',
  'underground',
  'commissariat',
  'cityHall',
];

export const TRACKS: Readonly<Record<RegionId, TrackDef>> = {
  forest: { region: 'forest', max: 6, vpMarks: [3, 6], citadelAt: 4, cityEntryRaiseAt: 5 },
  valley: { region: 'valley', max: 6, vpMarks: [3, 6], citadelAt: 4, cityEntryRaiseAt: 5 },
  city: { region: 'city', max: 8, vpMarks: [3, 5, 8], citadelAt: 6, cityEntryRaiseAt: null },
};

/** Вход в Город: базовая цена в золоте, +raiseStep за каждый сработавший рубеж, не больше max. */
export const CITY_ENTRY = { base: 1, raiseStep: 1, max: 3 } as const;

/**
 * Вход в Город (правило автора, cityEntryResource=mixed): базовая цена платится кровью,
 * а каждое подорожание по рубежам треков — золотом (к концу партии 1 кровь + 2 золота).
 */
export const CITY_ENTRY_MIXED = { base: 'blood', raise: 'gold' } as const;

/**
 * Эксперимент автора (23.11): бонус за первое достижение позиции трека влияния (trackBoosts).
 * Каждый игрок получает бонус позиции один раз за партию, даже если потом потерял и вернул влияние.
 */
export const TRACK_BOOSTS: Readonly<
  Record<RegionId, readonly { at: number; gain: Partial<Resources> }[]>
> = {
  forest: [{ at: 2, gain: { gold: 2 } }],
  valley: [{ at: 2, gain: { blood: 2 } }],
  // Автор 24.11: на треке Города позиции 2, 4 и 7 дают компромат (было по руде на 2 и 4).
  // Автор 24.11 (позже): руда вместо компромата.
  city: [
    { at: 2, gain: { ore: 1 } },
    { at: 4, gain: { ore: 1 } },
    { at: 7, gain: { ore: 1 } },
  ],
};

/** Престиж: трек до max, по 1 ПО на каждой отметке. */
// Автор 24.11: трек до 58 (максимум за партию); 53 — максимум с Обелиском вместо Шпиля.
export const PRESTIGE_TRACK = {
  max: 58,
  vpMarks: [3, 6, 10, 15, 20, 26, 33, 40, 48, 53, 58],
} as const;

const forestSurcharge = { gold: 2 };
const valleySurcharge = { gold: 2 };

/**
 * Доплата за двойной участок по региону вместо картонной (PLOTS) — правило автора по умолчанию
 * (переключатель plotSurcharge=ore; 'base' возвращает доплату из PLOTS).
 */
export const PLOT_SURCHARGE_VARIANTS = {
  // Город: двойные участки бесплатны (автор 23.11), у них нет доплаты и на картоне.
  ore: { forest: { ore: 1 }, valley: { ore: 1 }, city: {} },
} as const satisfies Record<string, Record<RegionId, Partial<Resources>>>;

/**
 * Правило автора (22.11, massBloodToGold=weak, по умолчанию): обмен крови на золото в Мессе на столько
 * золота хуже за единицу (1 → 2 в первом слоте, 1 → 1 во втором); золото → кровь без изменений.
 */
export const MASS_WEAK_BLOOD_TO_GOLD_PENALTY = 1;

/** Правило автора (22.11, citadelCost=cheap, по умолчанию): Цитадель — 6 золота и 2 руды (было 7 и 3). */
export const CITADEL_COST_CHEAP = { gold: 6, ore: 2 } as const;

/**
 * Доплата за участок на выбор игрока вместо доплаты по plotSurcharge (id участка → варианты).
 * Сейчас пусто: выбор у Таверны–Рынка отменён автором 23.11 (п. 22), доплата там — руда.
 */
export const PLOT_SURCHARGE_CHOICES: Readonly<Record<string, readonly Partial<Resources>[]>> = {};

/**
 * Участки под здания: по 6 на регион (автор 23.11). Цитадель стоит на звезде, не на участке.
 * В Городе все участки двойные и бесплатные; в Лесу и Долине доплата двойных — по plotSurcharge.
 */
export const PLOTS: readonly PlotDef[] = [
  { id: 'forest-mine', region: 'forest', adjacent: ['mine'], surcharge: {} },
  { id: 'forest-witchCircle', region: 'forest', adjacent: ['witchCircle'], surcharge: {} },
  { id: 'forest-lair', region: 'forest', adjacent: ['lair'], surcharge: {} },
  {
    id: 'forest-mine-lair',
    region: 'forest',
    adjacent: ['mine', 'lair'],
    surcharge: forestSurcharge,
  },
  {
    id: 'forest-mine-witchCircle',
    region: 'forest',
    adjacent: ['mine', 'witchCircle'],
    surcharge: forestSurcharge,
  },
  {
    id: 'forest-lair-witchCircle',
    region: 'forest',
    adjacent: ['lair', 'witchCircle'],
    surcharge: forestSurcharge,
  },
  { id: 'valley-market', region: 'valley', adjacent: ['market'], surcharge: {} },
  { id: 'valley-mass', region: 'valley', adjacent: ['mass'], surcharge: {} },
  { id: 'valley-tavern', region: 'valley', adjacent: ['tavern'], surcharge: {} },
  {
    id: 'valley-market-tavern',
    region: 'valley',
    adjacent: ['market', 'tavern'],
    surcharge: valleySurcharge,
  },
  {
    id: 'valley-mass-tavern',
    region: 'valley',
    adjacent: ['mass', 'tavern'],
    surcharge: valleySurcharge,
  },
  {
    id: 'valley-mass-market',
    region: 'valley',
    adjacent: ['mass', 'market'],
    surcharge: valleySurcharge,
  },
  {
    id: 'city-underground-chancery',
    region: 'city',
    adjacent: ['underground', 'chancery'],
    surcharge: {},
  },
  {
    id: 'city-underground-commissariat',
    region: 'city',
    adjacent: ['underground', 'commissariat'],
    surcharge: {},
  },
  {
    id: 'city-underground-cityHall',
    region: 'city',
    adjacent: ['underground', 'cityHall'],
    surcharge: {},
  },
  {
    id: 'city-chancery-commissariat',
    region: 'city',
    adjacent: ['chancery', 'commissariat'],
    surcharge: {},
  },
  {
    id: 'city-chancery-cityHall',
    region: 'city',
    adjacent: ['chancery', 'cityHall'],
    surcharge: {},
  },
  {
    id: 'city-commissariat-cityHall',
    region: 'city',
    adjacent: ['commissariat', 'cityHall'],
    surcharge: {},
  },
];
