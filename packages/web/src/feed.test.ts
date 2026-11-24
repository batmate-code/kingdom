import type { GameEvent } from '@vampire/core';
import { describe, expect, it } from 'vitest';
import { summarizeEvents } from './feed';

describe('Тосты: сводка изменений за ход', () => {
  it('Ресурсы суммируются по игроку, влияние — по регионам, престиж — отдельно', () => {
    const events: GameEvent[] = [
      { type: 'resourcesChanged', player: 1, delta: { gold: 3 }, reason: 'location' },
      { type: 'resourcesChanged', player: 1, delta: { gold: -1, blood: -1 }, reason: 'cityEntry' },
      { type: 'influenceChanged', player: 1, region: 'forest', from: 2, to: 3, reason: 'combat' },
      { type: 'prestigeChanged', player: 0, from: 4, to: 6, reason: 'building' },
    ];
    expect(summarizeEvents(events)).toEqual([
      { player: 0, text: '+2 престиж' },
      { player: 1, text: '+2 зол, -1 кр, +1 вл Лес' },
    ]);
  });

  it('Шпиль (эксперимент): постоянное ПО попадает в тост', () => {
    const events: GameEvent[] = [{ type: 'spireVp', player: 2, region: 'forest', vp: 1 }];
    expect(summarizeEvents(events)).toEqual([{ player: 2, text: '+1 ПО' }]);
  });

  it('Нулевой итог и события без ресурсов не дают тоста', () => {
    const events: GameEvent[] = [
      { type: 'resourcesChanged', player: 2, delta: { gold: 2 }, reason: 'mass' },
      { type: 'resourcesChanged', player: 2, delta: { gold: -2 }, reason: 'mass' },
      { type: 'passed', player: 0 },
    ];
    expect(summarizeEvents(events)).toEqual([]);
  });
});
