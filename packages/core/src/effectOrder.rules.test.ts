/** Переключатель effectOrder: свободный порядок эффектов при размещении (эксперимент для баланса). */
import type { CharacterId, ProfessionId } from '@vampire/data';
import { describe, expect, it } from 'vitest';
import { upkeepTier } from './draft';
import { applyAction, createGame, getLegalActions, isTerminal } from './engine';
import { findInvariantViolations } from './invariants';
import { nextRandom } from './rng';
import type { Action, EffectStep, GameState } from './types';
import { act, edit, newGame, place, res, setResources, setWorker, turnTo } from './testing';

const free = { effectOrder: 'free' as const };

const start = (r: Parameters<typeof setResources>[2] = {}) =>
  setResources(turnTo(newGame({ rules: free }), 0), 0, r);

const give = (
  s: GameState,
  workerId: string,
  character: CharacterId,
  profession: ProfessionId = 'guard',
) => setWorker(s, workerId, { character, profession });

const order = (s: GameState, effect: EffectStep) => act(s, { type: 'effectOrder', effect });

describe('Свободный порядок эффектов (effectOrder = free)', () => {
  it('По умолчанию порядок фиксированный', () => {
    expect(newGame().config.rules.effectOrder).toBe('fixed');
  });

  it('Игрок выбирает, что разыграть первым: персонаж или действие локации', () => {
    const s = place(give(start(), 'p0w0', 'storekeeper'), 'lair', 1, { workerId: 'p0w0' });
    expect(s.pending).toEqual({ kind: 'effectOrder', player: 0, workerId: 'p0w0' });
    expect(getLegalActions(s)).toEqual([
      { type: 'effectOrder', effect: 'character' },
      { type: 'effectOrder', effect: 'location' },
    ]);
  });

  it('Рабочий без персонажа и без активной профессии — выбора нет', () => {
    const s = place(start(), 'lair', 1, { workerId: 'p0w0' });
    expect(s.pending).toEqual({ kind: 'placement', player: 1 });
    expect(res(s, 0).ore).toBe(1);
  });

  it('Порядок меняет результат: Информатор после Канцелярии не даёт потратить свой компромат', () => {
    let s = place(give(start({ gold: 5 }), 'p0w0', 'informant'), 'chancery', 1, {
      workerId: 'p0w0',
    });
    s = order(s, 'location'); // компромата 0 — Канцелярия пропускается сама
    expect(s.pending).toEqual({ kind: 'placement', player: 1 });
    expect(res(s, 0).compromat).toBe(2);
  });

  it('Архитектор, потом Каменщик: золото и за только что построенное здание', () => {
    let s = place(give(start({ gold: 2 }), 'p0w0', 'mason', 'architect'), 'lair', 1, {
      workerId: 'p0w0',
    });
    expect(getLegalActions(s)).toEqual([
      { type: 'effectOrder', effect: 'character' },
      { type: 'effectOrder', effect: 'location' },
      { type: 'effectOrder', effect: 'profession' },
    ]);
    s = order(s, 'profession');
    s = act(s, {
      type: 'build',
      choice: { building: 'crypt', region: 'forest', plot: 'forest-lair' },
    });
    s = order(s, 'character');
    // Склеп (−2), Каменщик за 1 здание (+1), затем Логово сработало само (+1 руда).
    expect(res(s, 0)).toMatchObject({ gold: 1, ore: 1 });
  });

  it('Таверна первой: новый персонаж в этом размещении не срабатывает', () => {
    let s = give(start(), 'p0w0', 'storekeeper');
    s = edit(s, (d) => {
      d.deck.splice(d.deck.indexOf('bloodsucker'), 1);
      d.offer = { characters: ['bloodsucker'], professions: ['spy'] };
    });
    s = place(s, 'tavern', 1, { workerId: 'p0w0' });
    s = order(s, 'location');
    s = act(s, {
      type: 'locationAction',
      choice: { kind: 'tavernSwap', character: 'bloodsucker', profession: 'spy' },
    });
    // Шаг персонажа остался последним и разыгрался сам — но персонаж уже другой.
    expect(s.pending).toEqual({ kind: 'placement', player: 1 });
    // Отступные за старую пару (Кладовщика) — автор 23.11.
    const sev = upkeepTier('storekeeper').severance;
    expect(res(s, 0)).toMatchObject({ gold: 2 + (sev.gold ?? 0), blood: sev.blood ?? 0 });
  });

  it('Безумец после действия локации: заменять нечего, эффект не срабатывает', () => {
    let s = place(give(start(), 'p0w0', 'madman'), 'mine', 2, { workerId: 'p0w0' });
    s = order(s, 'location');
    expect(s.pending).toEqual({ kind: 'placement', player: 1 });
    expect(res(s, 0)).toMatchObject({ gold: 4, blood: 0 });
  });

  it('Безумец до действия локации заменяет его, как при фиксированном порядке', () => {
    let s = place(give(start(), 'p0w0', 'madman'), 'mine', 2, { workerId: 'p0w0' });
    s = order(s, 'character');
    s = act(s, { type: 'character', choice: { kind: 'madman', location: 'witchCircle' } });
    expect(res(s, 0)).toMatchObject({ gold: 2, blood: 3 });
  });

  it('Случайные партии со свободным порядком доходят до конца без нарушения инвариантов', () => {
    for (let seed = 1; seed <= 30; seed++) {
      let state = createGame({ playerCount: 2 + (seed % 3), rules: free }, seed);
      let rng = seed ^ 0x5eed;
      while (!isTerminal(state)) {
        const legal = getLegalActions(state);
        const [r, next] = nextRandom(rng);
        rng = next;
        state = applyAction(state, legal[Math.floor(r * legal.length)] as Action).state;
      }
      expect(findInvariantViolations(state)).toEqual([]);
    }
  }, 30_000);
});
