import type { LocationDef, LocationId, PlotDef, RegionDef, RegionId, TrackDef } from './types';

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
    slots: [{ kind: 'gain', gain: { ore: 1 } }, { kind: 'lairStash' }],
  },
  mass: {
    id: 'mass',
    name: 'Месса',
    region: 'valley',
    slots: [
      { kind: 'mass', rate: 3, maxTimes: 2 },
      { kind: 'mass', rate: 2, maxTimes: 2 },
    ],
  },
  market: {
    id: 'market',
    name: 'Рынок',
    region: 'valley',
    slots: [
      { kind: 'market', buyCost: 2, sellGain: 4 },
      { kind: 'market', buyCost: 3, sellGain: 3 },
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
      { kind: 'chancery', maxTimes: 2, goldBlood: 2, ore: 1, buildRightCost: 2 },
      { kind: 'chanceryBuild', compromatCost: 3 },
    ],
  },
  underground: {
    id: 'underground',
    name: 'Подполье',
    region: 'city',
    slots: [
      { kind: 'copy', goldCost: 1, scope: ['forest', 'valley', 'city'] },
      { kind: 'copy', goldCost: 1, scope: ['forest', 'valley'] },
    ],
  },
  commissariat: {
    id: 'commissariat',
    name: 'Комиссариат',
    region: 'city',
    slots: [{ kind: 'commissariatToken' }, { kind: 'revive', oreCost: 2 }],
  },
  cityHall: {
    id: 'cityHall',
    name: 'Ратуша',
    region: 'city',
    slots: [
      {
        kind: 'cityHall',
        offers: [
          { ore: 1, influence: 1 },
          { ore: 3, influence: 2 },
        ],
      },
      {
        kind: 'cityHall',
        offers: [
          { ore: 2, influence: 1 },
          { ore: 4, influence: 2 },
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

/** Престиж: трек до max, по 1 ПО на каждой отметке. */
export const PRESTIGE_TRACK = { max: 40, vpMarks: [3, 6, 10, 15, 20, 26, 33, 40] } as const;

const forestSurcharge = { gold: 2 };
const valleySurcharge = { gold: 2 };
const citySurcharge = { ore: 1 };

/** Участки под здания: по 5 на регион. Цитадель стоит на звезде, не на участке. */
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
  { id: 'city-chancery', region: 'city', adjacent: ['chancery'], surcharge: {} },
  { id: 'city-cityHall', region: 'city', adjacent: ['cityHall'], surcharge: {} },
  {
    id: 'city-underground-chancery',
    region: 'city',
    adjacent: ['underground', 'chancery'],
    surcharge: citySurcharge,
  },
  {
    id: 'city-underground-commissariat',
    region: 'city',
    adjacent: ['underground', 'commissariat'],
    surcharge: citySurcharge,
  },
  {
    id: 'city-commissariat-cityHall',
    region: 'city',
    adjacent: ['commissariat', 'cityHall'],
    surcharge: citySurcharge,
  },
];
