/** Эксперимент автора 23.11 (`combatTokenSet=six`): 6 жетонов боя, возврат каждые 2 раунда. */
import { COMBAT_TOKEN_ORDER, COMBAT_TOKENS_SIX_DECOYS } from '@vampire/data';
import { describe, expect, it } from 'vitest';
import { combatTokensRefreshAfter } from './combat';
import { DEFAULT_RULES } from './config';
import { createGame } from './engine';

describe('Жетоны боя: набор из 6 (combatTokenSet=six)', () => {
  it('Жетоны боя (автор 24.11): по одному каждого вида, Приманок две', () => {
    const s = createGame({ playerCount: 3, rules: { combatTokenSet: 'six' } }, 1);
    expect(COMBAT_TOKENS_SIX_DECOYS).toBe(2);
    for (const p of s.players) {
      expect(COMBAT_TOKEN_ORDER.map((t) => p.combatTokens.hand[t])).toEqual(
        COMBAT_TOKEN_ORDER.map((t) => (t === 'decoy' ? COMBAT_TOKENS_SIX_DECOYS : 1)),
      );
    }
  });

  it('Жетоны боя: сброс возвращается в конце 2, 4 и 6-го раунда; в базе — только 3-го', () => {
    const six = { ...DEFAULT_RULES, combatTokenSet: 'six' as const };
    const rounds = [1, 2, 3, 4, 5, 6];
    expect(rounds.filter((r) => combatTokensRefreshAfter(six, r))).toEqual([2, 4, 6]);
    const base = { ...DEFAULT_RULES, combatTokenSet: 'base' as const };
    expect(rounds.filter((r) => combatTokensRefreshAfter(DEFAULT_RULES, r))).toEqual([2, 4, 6]);
    expect(rounds.filter((r) => combatTokensRefreshAfter(base, r))).toEqual([3]);
  });
});
