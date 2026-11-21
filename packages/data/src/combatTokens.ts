import type { CombatTokenDef, CombatTokenId } from './types';

export const COMBAT_TOKENS: Readonly<Record<CombatTokenId, CombatTokenDef>> = {
  retreat: { id: 'retreat', name: 'Отступление', count: 1, strength: 0 },
  attack: { id: 'attack', name: 'Атака', count: 1, strength: 1 },
  massacre: { id: 'massacre', name: 'Резня', count: 1, strength: 2 },
  domination: { id: 'domination', name: 'Доминирование', count: 1, strength: 0 },
  defense: { id: 'defense', name: 'Защита', count: 1, strength: 1 },
  decoy: { id: 'decoy', name: 'Приманка', count: 5, strength: 0 },
};

/** Сыгранные жетоны возвращаются в руку в конце этого раунда. */
export const COMBAT_TOKENS_REFRESH_AFTER_ROUND = 3;

/** Награда победителю боя: базовое влияние и дополнительное влияние, если не выбрана стройка. */
export const COMBAT_REWARD = { influence: 1, bonusInfluence: 1, dominationInfluence: 1 } as const;
