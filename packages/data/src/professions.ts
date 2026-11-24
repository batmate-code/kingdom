import { DISPLACEMENT } from './game';
import type { ProfessionDef, ProfessionId } from './types';

/** Сила рабочего без профессии. */
export const BASE_WORKER_STRENGTH = 1;

/** Сила в бою Стража и Шпиона (тексты профессий берут числа отсюда же). */
const GUARD_STRENGTH = 2;
const SPY_STRENGTH = 2;

export const PROFESSIONS: Readonly<Record<ProfessionId, ProfessionDef>> = {
  guard: {
    id: 'guard',
    name: 'Страж',
    text: `Нельзя вытеснить. В бою сила ${GUARD_STRENGTH}.`,
    color: 'green',
    // Автор 23.11: Страж +1 к силе в бою (было 1).
    combatStrength: GUARD_STRENGTH,
    immuneToDisplacement: true,
    freeCityEntry: false,
  },
  executioner: {
    id: 'executioner',
    name: 'Палач',
    text: `При размещении в первый слот может вытеснить чужого рабочего (из первого или второго слота) другой локации того же региона (и когда сам попал в первый слот вытеснением — тогда выбивает двоих). Владелец вытесненного получает ${DISPLACEMENT.executionerCompensation} компромат, сам Палач — ${DISPLACEMENT.executionerReward}.`,
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
    text: `Сила ${SPY_STRENGTH} вместо ${BASE_WORKER_STRENGTH}. Перед боями может перейти в другой слот своего или другого региона без действия.`,
    color: 'purple',
    combatStrength: SPY_STRENGTH,
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
