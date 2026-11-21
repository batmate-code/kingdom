import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createGame,
  findInvariantViolations,
  getLegalActions,
  getObservation,
  isTerminal,
  nextRandom,
  type Action,
  type GameState,
} from './index';

function randomPlayout(seed: number, playerCount: number): { state: GameState; actions: Action[] } {
  let state = createGame({ playerCount }, seed);
  let rng = seed ^ 0x5eed;
  const actions: Action[] = [];
  while (!isTerminal(state)) {
    const legal = getLegalActions(state);
    expect(legal.length).toBeGreaterThan(0);
    const [r, next] = nextRandom(rng);
    rng = next;
    const action = legal[Math.floor(r * legal.length)] as Action;
    actions.push(action);
    state = applyAction(state, action).state;
  }
  return { state, actions };
}

describe('API ядра', () => {
  it('случайные партии на 2–4 игроков доходят до конца без нарушения инвариантов', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const { state } = randomPlayout(seed, 2 + (seed % 3));
      expect(isTerminal(state)).toBe(true);
      expect(state.round).toBe(6);
      expect(findInvariantViolations(state)).toEqual([]);
      expect(getLegalActions(state)).toEqual([]);
    }
  }, 30_000);

  it('партия воспроизводится по seed и списку действий', () => {
    const { state, actions } = randomPlayout(42, 3);
    let replay = createGame({ playerCount: 3 }, 42);
    for (const a of actions) replay = applyAction(replay, a).state;
    expect(replay).toEqual(state);
  });

  it('состояние переживает JSON без потерь и с ним можно продолжать игру', () => {
    let state = createGame({ playerCount: 3 }, 5);
    state = applyAction(state, getLegalActions(state)[0] as Action).state;
    const copy = JSON.parse(JSON.stringify(state)) as GameState;
    expect(copy).toEqual(state);
    const a = getLegalActions(copy)[0] as Action;
    expect(applyAction(copy, a).state).toEqual(applyAction(state, a).state);
  });

  it('недопустимое действие отклоняется, исходное состояние не меняется', () => {
    const state = createGame({ playerCount: 3 }, 3);
    const before = JSON.stringify(state);
    expect(() => applyAction(state, { type: 'combatReward', choice: 'influence' })).toThrow();
    expect(JSON.stringify(state)).toBe(before);
  });

  it('наблюдение не раскрывает генератор случайных чисел и очередь шагов', () => {
    const state = createGame({ playerCount: 3 }, 3);
    const obs = getObservation(state, 1);
    expect(obs.viewer).toBe(1);
    expect('rng' in obs).toBe(false);
    expect('tasks' in obs).toBe(false);
  });

  it('число игроков 2–4, иначе ошибка', () => {
    expect(() => createGame({ playerCount: 1 }, 1)).toThrow();
    expect(() => createGame({ playerCount: 5 }, 1)).toThrow();
    for (const n of [2, 3, 4]) expect(createGame({ playerCount: n }, 1).players).toHaveLength(n);
  });
});
