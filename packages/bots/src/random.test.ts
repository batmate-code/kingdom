import {
  applyAction,
  createGame,
  getLegalActions,
  getObservation,
  isTerminal,
} from '@vampire/core';
import type { Action, GameState } from '@vampire/core';
import { describe, expect, it } from 'vitest';
import type { Bot } from './index';
import { actionPath, createGroupedRandomBot, createRandomBot, withoutEarlyPass } from './random';

function play(bots: Bot[], seed: number): { state: GameState; actions: Action[]; passes: number } {
  let state = createGame({ playerCount: bots.length }, seed);
  const actions: Action[] = [];
  let passes = 0;
  while (!isTerminal(state)) {
    const player = state.pending?.player ?? 0;
    const legal = getLegalActions(state);
    const action = (bots[player] as Bot).chooseAction(getObservation(state, player), legal);
    expect(legal).toContainEqual(action);
    if (action.type === 'pass') {
      passes++;
      // Пас — только когда выставить рабочего некуда.
      expect(legal.some((a) => a.type === 'place')).toBe(false);
    }
    actions.push(action);
    state = applyAction(state, action).state;
  }
  return { state, actions, passes };
}

describe('Случайные боты', () => {
  it('Пас убирается, пока есть размещение; без размещений остаётся', () => {
    const place: Action = {
      type: 'place',
      workerId: 'p0w0',
      location: 'mine',
      slot: 1,
      displace: false,
    };
    expect(withoutEarlyPass([place, { type: 'pass' }])).toEqual([place]);
    expect(withoutEarlyPass([{ type: 'pass' }])).toEqual([{ type: 'pass' }]);
  });

  it.each([
    ['random', createRandomBot],
    ['random-grouped', createGroupedRandomBot],
  ] as const)('%s: доигрывает партию, ходит только допустимо и не пасует рано', (_name, make) => {
    const { state } = play([make(1), make(2), make(3)], 11);
    expect(isTerminal(state)).toBe(true);
  });

  it.each([
    ['random', createRandomBot],
    ['random-grouped', createGroupedRandomBot],
  ] as const)('%s: одинаковые seed — одинаковая партия', (_name, make) => {
    const a = play([make(5), make(6)], 3).actions;
    const b = play([make(5), make(6)], 3).actions;
    expect(a).toEqual(b);
  });

  it('По ступеням: «пропустить» выпадает около половины раз, хотя вариантов обмена девять', () => {
    const legal: Action[] = [
      ...Array.from({ length: 9 }, (_, i): Action => ({
        type: 'locationAction',
        choice: { kind: 'mass', from: 'gold', times: i + 1 },
      })),
      { type: 'locationAction', choice: { kind: 'skip' } },
    ];
    const bot = createGroupedRandomBot(42);
    const obs = getObservation(createGame({ playerCount: 3 }, 1), 0);
    let skips = 0;
    const n = 2000;
    for (let k = 0; k < n; k++) {
      const a = bot.chooseAction(obs, legal);
      if (a.type === 'locationAction' && a.choice.kind === 'skip') skips++;
    }
    expect(skips / n).toBeGreaterThan(0.45);
    expect(skips / n).toBeLessThan(0.55);
    expect(actionPath({ type: 'locationAction', choice: { kind: 'skip' } })).toEqual(['skip']);
  });

  it('Пути ходов в каждом решении различны (иначе выбор по ступеням не был бы случайным)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      let state = createGame({ playerCount: 3 }, seed);
      const bot = createRandomBot(seed);
      while (!isTerminal(state)) {
        const legal = getLegalActions(state);
        const paths = legal.map((a) => actionPath(a).join('|'));
        expect(new Set(paths).size).toBe(paths.length);
        const player = state.pending?.player ?? 0;
        state = applyAction(state, bot.chooseAction(getObservation(state, player), legal)).state;
      }
    }
  }, 30_000);
});
