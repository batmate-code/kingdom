import type { CombatTokenDef, CombatTokenId } from './types';

/** Автор 23.11: сила Защиты, если она отменила Резню хотя бы одного соперника. */
export const DEFENSE_COUNTER_BONUS = 1;

/** Награда победителю боя: базовое влияние и дополнительное влияние, если не выбрана стройка. */
export const COMBAT_REWARD = { influence: 1, bonusInfluence: 1, dominationInfluence: 1 } as const;

/** Сила жетонов (тексты берут числа отсюда же). */
const ATTACK_STRENGTH = 1;
const MASSACRE_STRENGTH = 2;

export const COMBAT_TOKENS: Readonly<Record<CombatTokenId, CombatTokenDef>> = {
  retreat: {
    id: 'retreat',
    name: 'Отступление',
    count: 1,
    strength: 0,
    text: 'Проигрыш боя; все свои рабочие региона уходят в регион, где боя ещё не было. В Городе — просто проигрыш',
  },
  attack: {
    id: 'attack',
    name: 'Атака',
    count: 1,
    strength: ATTACK_STRENGTH,
    text: `+${ATTACK_STRENGTH} к силе`,
  },
  massacre: {
    id: 'massacre',
    name: 'Резня',
    count: 1,
    strength: MASSACRE_STRENGTH,
    text: `+${MASSACRE_STRENGTH} к силе`,
  },
  domination: {
    id: 'domination',
    name: 'Доминация',
    count: 1,
    strength: 0,
    text: `При победе +${COMBAT_REWARD.dominationInfluence} влияние сверх награды; отменяет Отступление соперника. Нельзя, если в регионе нет соперников`,
  },
  defense: {
    id: 'defense',
    name: 'Защита',
    count: 1,
    // Автор 23.11: +1 к силе только если отменила Резню соперника (DEFENSE_COUNTER_BONUS).
    strength: 0,
    text: `Отменяет Резню соперника и тогда даёт +${DEFENSE_COUNTER_BONUS} к силе`,
  },
  decoy: { id: 'decoy', name: 'Приманка', count: 5, strength: 0, text: 'Без эффекта — блеф' },
};

/**
 * Порядок перечисления жетонов в действиях. Приманка первой: «первый допустимый вариант»
 * (простые боты, тесты) ничего не меняет в бою.
 */
export const COMBAT_TOKEN_ORDER: readonly CombatTokenId[] = [
  'decoy',
  'attack',
  'defense',
  'massacre',
  'domination',
  'retreat',
];

/** Сыгранные жетоны возвращаются в руку в конце этого раунда. */
export const COMBAT_TOKENS_REFRESH_AFTER_ROUND = 3;

/**
 * Эксперимент автора 23.11 (`combatTokenSet=six`): по одному жетону каждого вида (6 в наборе),
 * сыгранные возвращаются в руку в конце каждого COMBAT_TOKENS_SIX_REFRESH_EVERY-го раунда.
 */
export const COMBAT_TOKENS_SIX_COUNT = 1;
/** Автор 24.11: в наборе «6 жетонов» Приманок (Блеф) две — остальных по одному. */
export const COMBAT_TOKENS_SIX_DECOYS = 2; // автор 24.11 (после партии): две, чтобы не остаться с одной Доминацией
export const COMBAT_TOKENS_SIX_REFRESH_EVERY = 2;
