import { describe, expect, it } from 'vitest';
import { getObservation } from './engine';
import type { GameState } from './types';
import { edit, locationOptions, newGame, place, setResources, setWorker, turnTo } from './testing';

describe('Переключатели спорных правил (вариант B)', () => {
  it('OQ-5: в Ратуше нельзя платить за влияние в регионе с полным треком', () => {
    let s = setResources(turnTo(newGame({ rules: { cityHallAllowsFullTrack: false } }), 0), 0, {
      ore: 1,
    });
    s = edit(s, (d) => {
      (d.players[0] as GameState['players'][number]).influence.forest = 6;
    });
    s = place(s, 'cityHall', 1);
    const regions = locationOptions(s).flatMap((o) => (o.kind === 'cityHall' ? [o.region] : []));
    expect(regions).toEqual(['valley', 'city']);
  });

  it('OQ-6: Подполье предлагает только те копии, которые есть чем выполнить', () => {
    let s = turnTo(newGame({ rules: { copyAllowsUselessTarget: false } }), 0);
    s = setResources(s, 0, { gold: 2, blood: 0, ore: 0, compromat: 0 });
    s = place(s, 'underground', 1);
    const targets = locationOptions(s).flatMap((o) =>
      o.kind === 'copy' ? [`${o.location}/${o.slot}`] : [],
    );
    // После входа (1) и копии (1) золота 0: Месса, Рынок, Ратуша, Канцелярия и второй слот
    // Комиссариата бесполезны; жетон Комиссариата бесплатный.
    expect(targets).toEqual([
      'mine/1',
      'mine/2',
      'witchCircle/1',
      'witchCircle/2',
      'lair/1',
      'lair/2',
      'tavern/2',
      'commissariat/1',
    ]);
  });
});

describe('Скрытая информация', () => {
  it('Состояния, различающиеся только скрытым, дают одинаковое наблюдение', () => {
    const a = setWorker(newGame({}, 9), 'p0w0', {});
    const b = edit(a, (d) => {
      d.rng = d.rng + 12345;
      // Порядок колоды — скрытый.
      d.deck = [...d.deck].reverse();
    });
    expect(getObservation(b, 1)).toEqual(getObservation(a, 1));
  });
});
