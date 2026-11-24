import type { CharacterId } from '@vampire/data';
import { describe, expect, it } from 'vitest';
import { getLegalActions } from './engine';
import type { GameEvent, GameState } from './types';
import { act, moveWorker, newGame, res, setResources, setWorker } from './testing';

/** Игрок 0 с персонажем на p0w0; все пасуют до шага содержания. */
function toUpkeep(character: CharacterId, blood: number, opts: { hospital?: boolean } = {}) {
  let s = setWorker(newGame(), 'p0w0', { profession: 'guard', character });
  s = setResources(s, 0, { blood });
  if (opts.hospital) s = moveWorker(s, 'p0w0', { kind: 'hospital' });
  const log: GameEvent[] = [];
  while (s.pending?.kind === 'placement') s = act(s, { type: 'pass' }, log);
  return { s, log };
}

const worker = (s: GameState, id: string) => s.workers.find((w) => w.id === id);

describe('Содержание в конце раунда', () => {
  it('За улучшенного рабочего платится кровь по карте — или пара сбрасывается за отступные', () => {
    const { s } = toUpkeep('officer', 5);
    expect(s.phase).toBe('upkeep');
    expect(s.pending).toEqual({ kind: 'upkeep', player: 0, workerId: 'p0w0' });
    expect(getLegalActions(s)).toEqual([
      { type: 'upkeep', choice: 'pay' },
      { type: 'upkeep', choice: 'discard' },
    ]);
    const paid = act(s, { type: 'upkeep', choice: 'pay' });
    expect(res(paid, 0).blood).toBe(5 - 2);
    expect(worker(paid, 'p0w0')?.character).toBe('officer');
  });

  it('Сброс вместо оплаты: отступные, персонаж в сброс, рабочий без улучшения', () => {
    const { s } = toUpkeep('storekeeper', 5);
    const after = act(s, { type: 'upkeep', choice: 'discard' });
    expect(res(after, 0)).toMatchObject({ blood: 5, gold: 2 + 2 });
    expect(after.discard).toContain('storekeeper');
    expect(worker(after, 'p0w0')).toMatchObject({ character: null, profession: null });
  });

  it('Не хватает крови — пара сбрасывается автоматически', () => {
    const { s, log } = toUpkeep('manipulator', 2);
    expect(s.phase).not.toBe('upkeep');
    expect(worker(s, 'p0w0')?.character).toBeNull();
    expect(log).toContainEqual({
      type: 'pairDiscarded',
      player: 0,
      character: 'manipulator',
      profession: 'guard',
      reason: 'upkeep',
    });
  });

  it('Рабочий в госпитале платит на 1 меньше (содержание считается до возврата рабочих)', () => {
    const { s } = toUpkeep('officer', 1, { hospital: true });
    expect(getLegalActions(s)).toContainEqual({ type: 'upkeep', choice: 'pay' });
    const paid = act(s, { type: 'upkeep', choice: 'pay' });
    expect(res(paid, 0).blood).toBe(0);
    expect(worker(paid, 'p0w0')?.character).toBe('officer');
  });

  it('Содержание не ниже 0: персонаж за 0 в госпитале бесплатен; сбросить его всё равно можно', () => {
    const { s } = toUpkeep('bloodsucker', 0, { hospital: true });
    expect(getLegalActions(s)).toEqual([
      { type: 'upkeep', choice: 'pay' },
      { type: 'upkeep', choice: 'discard' },
    ]);
    const dropped = act(s, { type: 'upkeep', choice: 'discard' });
    expect(res(dropped, 0).ore).toBe(1);
  });

  it('Рабочий без улучшения возвращается бесплатно — решения нет', () => {
    let s = newGame();
    while (s.pending?.kind === 'placement') s = act(s, { type: 'pass' });
    expect(s.round).toBe(2);
  });

  it('Решения о содержании идут с первого игрока', () => {
    let s = newGame({}, 5);
    const f = s.firstPlayer;
    const second = (f + 1) % 3;
    s = setWorker(s, `p${second}w0`, { profession: 'spy', character: 'officer' });
    s = setWorker(s, `p${f}w1`, { profession: 'spy', character: 'diplomat' });
    s = setResources(s, f, { blood: 5 });
    s = setResources(s, second, { blood: 5 });
    while (s.pending?.kind === 'placement') s = act(s, { type: 'pass' });
    expect(s.pending).toEqual({ kind: 'upkeep', player: f, workerId: `p${f}w1` });
    s = act(s, { type: 'upkeep', choice: 'pay' });
    expect(s.pending).toEqual({ kind: 'upkeep', player: second, workerId: `p${second}w0` });
  });
});
