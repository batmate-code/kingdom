import { getLegalActions, isTerminal } from '@vampire/core';
import { describe, expect, it } from 'vitest';
import { actionLabel, decisionTitle } from './labels';
import { useGame } from './store';

describe('Интерфейс: хранилище и подписи', () => {
  it('Партия «человек + боты» доигрывается; у каждого хода и решения есть подпись', () => {
    const store = useGame.getState();
    store.start(['human', 'random-grouped', 'random-grouped'], 7);
    let steps = 0;
    while (!isTerminal(useGame.getState().state!) && steps < 5000) {
      const s = useGame.getState().state!;
      expect(decisionTitle(s)).not.toBe('');
      const legal = getLegalActions(s);
      for (const a of legal) expect(actionLabel(s, a)).toBeTruthy();
      if (!useGame.getState().botStep()) useGame.getState().act(legal[0]!);
      expect(useGame.getState().error).toBeNull();
      steps++;
    }
    expect(isTerminal(useGame.getState().state!)).toBe(true);
    expect(useGame.getState().log.some((l) => l.text.includes('Партия окончена'))).toBe(true);
  });
});
