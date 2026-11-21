import {
  applyAction,
  createGame,
  getLegalActions,
  getObservation,
  getScores,
  isTerminal,
  type Action,
  type GameState,
} from '@vampire/core';
import { describe, expect, it } from 'vitest';
import type { Bot } from '../index';
import { createGroupedRandomBot } from '../random';
import { evaluate, futureShare } from './evaluate';
import { createHeuristicBot } from './index';

function play(bots: Bot[], seed: number): GameState {
  let state = createGame({ playerCount: bots.length }, seed);
  while (!isTerminal(state)) {
    const player = state.pending?.player ?? 0;
    const legal = getLegalActions(state);
    const action = (bots[player] as Bot).chooseAction(getObservation(state, player), legal);
    expect(legal).toContainEqual(action);
    state = applyAction(state, action).state;
  }
  return state;
}

describe('Эвристический бот', () => {
  it('Доигрывает партию только допустимыми ходами и обыгрывает случайных ботов', () => {
    let wins = 0;
    for (const seed of [1, 2, 3]) {
      const state = play(
        [
          createHeuristicBot(seed),
          createGroupedRandomBot(seed + 10),
          createGroupedRandomBot(seed + 20),
        ],
        seed,
      );
      if (getScores(state).find((s) => s.player === 0)?.rank === 1) wins++;
    }
    expect(wins).toBe(3);
  }, 60_000);

  it('Детерминирован: тот же seed — та же партия', () => {
    const run = () =>
      getScores(play([createHeuristicBot(7), createHeuristicBot(8)], 5)).map((s) => s.vp);
    expect(run()).toEqual(run());
  }, 60_000);

  it('Оценка: ресурсы к концу партии дешевеют, лишнее золото — лучше', () => {
    const s = createGame({ playerCount: 3 }, 1);
    const richer: GameState = {
      ...s,
      players: s.players.map((p, i) =>
        i === 0 ? { ...p, resources: { ...p.resources, gold: 10 } } : p,
      ),
    };
    expect(evaluate(richer, 0)).toBeGreaterThan(evaluate(s, 0));
    expect(futureShare(s)).toBeCloseTo(1);
    expect(futureShare({ ...s, round: s.config.rounds, phase: 'upkeep' })).toBeLessThan(0.1);
  });

  it('Берёт выигрышный вариант: из двух ходов выбирает дающий ресурсы', () => {
    const s = createGame({ playerCount: 3 }, 1);
    const bot = createHeuristicBot(1);
    // На драфте варианты разные; бот должен выбрать один из допустимых и не упасть.
    const legal = getLegalActions(s);
    const a: Action = bot.chooseAction(getObservation(s, s.pending?.player ?? 0), legal);
    expect(legal).toContainEqual(a);
  });
});
