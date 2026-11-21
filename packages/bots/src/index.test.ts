import {
  applyAction,
  createGame,
  getLegalActions,
  getObservation,
  isTerminal,
} from '@vampire/core';
import { describe, expect, it } from 'vitest';
import { firstLegalBot } from './index';

describe('firstLegalBot', () => {
  it('доигрывает партию до конца через API ядра', () => {
    let state = createGame({ playerCount: 3 }, 1);
    let steps = 0;
    while (!isTerminal(state)) {
      const player = state.pending?.player ?? 0;
      const action = firstLegalBot.chooseAction(
        getObservation(state, player),
        getLegalActions(state),
      );
      state = applyAction(state, action).state;
      steps++;
      expect(steps).toBeLessThan(10_000);
    }
    expect(state.round).toBe(6);
  });
});
