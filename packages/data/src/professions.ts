import type { ProfessionDef, ProfessionId } from './types';

export const PROFESSIONS: Readonly<Record<ProfessionId, ProfessionDef>> = {
  guard: {
    id: 'guard',
    name: 'Страж',
    color: 'green',
    combatStrength: 1,
    immuneToDisplacement: true,
    freeCityEntry: false,
  },
  executioner: {
    id: 'executioner',
    name: 'Палач',
    color: 'red',
    combatStrength: 1,
    immuneToDisplacement: false,
    freeCityEntry: false,
  },
  architect: {
    id: 'architect',
    name: 'Архитектор',
    color: 'blue',
    combatStrength: 1,
    immuneToDisplacement: false,
    freeCityEntry: false,
  },
  aristocrat: {
    id: 'aristocrat',
    name: 'Аристократ',
    color: 'yellow',
    combatStrength: 1,
    immuneToDisplacement: false,
    freeCityEntry: true,
  },
  spy: {
    id: 'spy',
    name: 'Шпион',
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
