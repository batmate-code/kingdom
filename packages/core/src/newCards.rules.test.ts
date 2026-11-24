/** Новые карты автора 24.11: Наёмник, Перевёртыш, Подрядчик. */
import { CHARACTER_PARAMS as P, type CharacterId } from '@vampire/data';
import { describe, expect, it } from 'vitest';
import { getLegalActions } from './engine';
import type { GameState } from './types';
import { act, edit, newGame, place, res, setResources, setWorker, turnTo } from './testing';

const give = (s: GameState, workerId: string, character: CharacterId) =>
  setWorker(s, workerId, { character, profession: 'guard' });

describe('Новые карты (автор 24.11)', () => {
  it('Наёмник: жетон силы на карту, копится до предела и не снимается в конце раунда', () => {
    let s = give(turnTo(newGame(), 0), 'p0w0', 'mercenary');
    s = edit(s, (d) => {
      d.workers.find((w) => w.id === 'p0w0')!.garrison = P.mercenary.maxTokens - 1;
    });
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    s = act(s, { type: 'character', choice: { kind: 'mercenary', deploy: false } });
    expect(s.workers.find((w) => w.id === 'p0w0')?.garrison).toBe(P.mercenary.maxTokens);
    s = edit(s, (d) => {
      d.workers.find((w) => w.id === 'p0w1')!.character = 'mercenary';
    });
    // Предел: ещё одно срабатывание не добавляет сверх maxTokens.
    expect(s.workers.find((w) => w.id === 'p0w0')?.garrison).toBe(P.mercenary.maxTokens);
  });

  it('Наёмник (автор 24.11): сразу при размещении можно выложить жетоны с карты в регион', () => {
    let s = give(turnTo(newGame(), 0), 'p0w0', 'mercenary');
    s = edit(s, (d) => {
      d.workers.find((w) => w.id === 'p0w0')!.garrison = 2;
    });
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    expect(s.pending?.kind).toBe('character');
    s = act(s, { type: 'character', choice: { kind: 'mercenary', deploy: true } });
    // На карте было 2, +1 при размещении — все 3 жетона ушли в Лес.
    expect(s.powerTokens).toContainEqual({
      owner: 0,
      region: 'forest',
      count: P.mercenary.maxTokens,
    });
    expect(s.workers.find((w) => w.id === 'p0w0')?.garrison).toBeUndefined();
  });

  it('Перевёртыш: выполняет эффект персонажа рабочего соперника', () => {
    let s = give(turnTo(newGame(), 0), 'p0w0', 'shapeshifter');
    s = give(s, 'p1w0', 'storekeeper');
    const gold = res(s, 0).gold;
    // Единственный вариант (Кладовщик соперника) разыгрывается сразу.
    s = place(s, 'witchCircle', 1, { workerId: 'p0w0' });
    expect(res(s, 0).gold).toBe(gold + P.storekeeper.gold);
  });

  it('Перевёртыш не копирует Наёмника, Рудного барона, Доносчика и пассивные свойства', () => {
    let s = give(turnTo(newGame(), 0), 'p0w0', 'shapeshifter');
    s = give(s, 'p1w0', 'mercenary');
    s = give(s, 'p1w1', 'marauder');
    s = give(s, 'p2w0', 'oreBaron');
    s = place(s, 'witchCircle', 1, { workerId: 'p0w0' });
    expect(s.pending?.kind).not.toBe('character');
  });

  it('Подрядчик: право стройки в текущем регионе по полной цене', () => {
    let s = setResources(give(turnTo(newGame(), 0), 'p0w0', 'contractor'), 0, { gold: 2 });
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    expect(s.pending).toMatchObject({
      kind: 'build',
      source: { kind: 'contractor', region: 'forest' },
    });
    expect(
      getLegalActions(s).every(
        (a) => a.type !== 'build' || !a.choice || a.choice.region === 'forest',
      ),
    ).toBe(true);
  });
});
