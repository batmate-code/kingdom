/** Правило автора 23.11: доплата за участок между Таверной и Рынком — 2 золота/крови на выбор. */
import { PLOT_SURCHARGE_CHOICES } from '@vampire/data';
import { describe, expect, it } from 'vitest';
import { buildCost } from './buildings';
import { newGame } from './testing';

describe('Участок Таверна–Рынок: доплата на выбор (автор, 23.11)', () => {
  it('Здания: три варианта доплаты — 2 золота, 1+1, 2 крови', () => {
    expect(PLOT_SURCHARGE_CHOICES['valley-market-tavern']).toEqual([
      { gold: 2 },
      { gold: 1, blood: 1 },
      { blood: 2 },
    ]);
  });

  it('Здания: выбранная доплата добавляется к цене здания вместо руды', () => {
    const s = newGame();
    const base = buildCost(s, { building: 'crypt', region: 'valley', plot: null });
    const cost = buildCost(s, {
      building: 'crypt',
      region: 'valley',
      plot: 'valley-market-tavern',
      surcharge: { gold: 1, blood: 1 },
    });
    expect(cost).toEqual({
      ...base,
      gold: (base.gold ?? 0) + 1,
      blood: (base.blood ?? 0) + 1,
    });
  });
});
