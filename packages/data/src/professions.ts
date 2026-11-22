import type { ProfessionDef, ProfessionId } from './types';

export const PROFESSIONS: Readonly<Record<ProfessionId, ProfessionDef>> = {
  guard: {
    id: 'guard',
    name: 'Страж',
    text: 'Нельзя вытеснить.',
    color: 'green',
    combatStrength: 1,
    immuneToDisplacement: true,
    freeCityEntry: false,
  },
  executioner: {
    id: 'executioner',
    name: 'Палач',
    text: 'При размещении в первый слот может вытеснить чужого рабочего из другой локации того же региона (и когда сам попал в первый слот вытеснением — тогда выбивает двоих). Владелец вытесненного получает 1 компромат.',
    color: 'red',
    combatStrength: 1,
    immuneToDisplacement: false,
    freeCityEntry: false,
  },
  architect: {
    id: 'architect',
    name: 'Архитектор',
    text: 'При размещении может построить здание на свободном участке у своей локации, оплатив полную цену.',
    color: 'blue',
    combatStrength: 1,
    immuneToDisplacement: false,
    freeCityEntry: false,
  },
  aristocrat: {
    id: 'aristocrat',
    name: 'Аристократ',
    text: 'Не платит за вход в Город.',
    color: 'yellow',
    combatStrength: 1,
    immuneToDisplacement: false,
    freeCityEntry: true,
  },
  spy: {
    id: 'spy',
    name: 'Шпион',
    text: 'Сила 2 вместо 1. Перед боями может перейти в другой регион без действия.',
    color: 'purple',
    combatStrength: 2,
    immuneToDisplacement: false,
    freeCityEntry: false,
  },
};

export const PROFESSION_ORDER: readonly ProfessionId[] = [
  'guard',
  'executioner',
  'architect',
  'aristocrat',
  'spy',
];

/** Жетоны профессий локаций: по 2 каждой профессии, всего 10 — по одному на локацию. */
export const LOCATION_PROFESSION_TOKENS: readonly ProfessionId[] = PROFESSION_ORDER.flatMap((p) => [
  p,
  p,
]);

/** Сила рабочего без профессии. */
export const BASE_WORKER_STRENGTH = 1;
