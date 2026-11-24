/**
 * Доплата участка на выбор игрока (PLOT_SURCHARGE_CHOICES). Выбор у Таверны–Рынка автор отменил
 * 23.11 (п. 22), механизм остаётся для экспериментов.
 */
import { PLOT_SURCHARGE_CHOICES } from '@vampire/data';
import { describe, expect, it } from 'vitest';
import { buildCost, plotSurcharge } from './buildings';
import { newGame } from './testing';

describe('Доплата участка на выбор', () => {
  it('Таверна–Рынок (автор 23.11, п. 22): выбора нет, доплата — руда', () => {
    expect(PLOT_SURCHARGE_CHOICES['valley-market-tavern']).toBeUndefined();
    const s = newGame({ rules: { plotSurcharge: 'ore' } });
    expect(plotSurcharge(s, 'valley-market-tavern')).toEqual({ ore: 1 });
  });

  it('Здания: выбранная доплата добавляется к цене здания вместо доплаты по правилу', () => {
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
