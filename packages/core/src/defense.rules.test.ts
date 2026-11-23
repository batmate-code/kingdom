/** Автор 23.11: Защита даёт +1 к силе, только если отменила Резню соперника. */
import { COMBAT_TOKENS, DEFENSE_COUNTER_BONUS, type CombatTokenId } from '@vampire/data';
import { describe, expect, it } from 'vitest';
import { tokenEffects } from './combat';

/** Разница прибавок «игрок 0 минус игрок 1» в бою один на один. */
function diff(mine: CombatTokenId, theirs: CombatTokenId): number {
  const e = tokenEffects([
    { player: 0, token: mine },
    { player: 1, token: theirs },
  ]);
  return (e.get(0)?.bonus ?? 0) - (e.get(1)?.bonus ?? 0);
}

describe('Жетоны боя: Защита (автор 23.11)', () => {
  it('Защита против Резни: Резня отменена, Защита даёт +1', () => {
    const e = tokenEffects([
      { player: 0, token: 'defense' },
      { player: 1, token: 'massacre' },
    ]);
    expect(e.get(0)?.bonus).toBe(DEFENSE_COUNTER_BONUS);
    expect(e.get(1)?.bonus).toBe(0);
  });

  it('Защита без Резни соперника — сила 0', () => {
    for (const t of ['attack', 'defense', 'decoy', 'domination'] as const) {
      expect(
        tokenEffects([
          { player: 0, token: 'defense' },
          { player: 1, token: t },
        ]).get(0)?.bonus,
      ).toBe(0);
    }
  });

  it('Треугольник: Атака бьёт Защиту, Защита бьёт Резню, Резня бьёт Атаку', () => {
    expect(diff('attack', 'defense')).toBe(COMBAT_TOKENS.attack.strength);
    expect(diff('defense', 'massacre')).toBe(DEFENSE_COUNTER_BONUS);
    expect(diff('massacre', 'attack')).toBe(
      COMBAT_TOKENS.massacre.strength - COMBAT_TOKENS.attack.strength,
    );
  });

  it('OQ-22: Защита отменяет Резню каждого соперника, прибавка одна', () => {
    const e = tokenEffects([
      { player: 0, token: 'defense' },
      { player: 1, token: 'massacre' },
      { player: 2, token: 'massacre' },
    ]);
    expect(e.get(0)?.bonus).toBe(DEFENSE_COUNTER_BONUS);
    expect([e.get(1)?.bonus, e.get(2)?.bonus]).toEqual([0, 0]);
  });
});
