import { describe, expect, it } from 'vitest';
import { determinize } from './determinize';
import { applyAction, createGame, getLegalActions, getObservation, isTerminal } from './engine';
import { findInvariantViolations } from './invariants';
import type { Action } from './types';
import { act, moveWorker, newGame } from './testing';

describe('determinize', () => {
  it('Открытое совпадает с наблюдением, колода — те же невидимые карты', () => {
    const s = createGame({ playerCount: 3 }, 4);
    const d = determinize(getObservation(s, 1), 77);
    expect(getObservation({ ...d, config: s.config }, 1)).toEqual(getObservation(s, 1));
    expect([...d.deck].sort()).toEqual([...s.deck].sort());
    expect(findInvariantViolations(d)).toEqual([]);
  });

  it('Чужой закрытый жетон боя заменяется жетоном из его руки', () => {
    let s = moveWorker(newGame({}, 1), 'p0w0', { kind: 'slot', location: 'mine', slot: 1 });
    s = moveWorker(s, 'p1w0', { kind: 'slot', location: 'witchCircle', slot: 1 });
    while (s.pending?.kind === 'placement') s = act(s, { type: 'pass' });
    const first = s.pending?.player ?? 0;
    s = act(s, { type: 'combatToken', token: 'massacre' });
    const other = first === 0 ? 1 : 0;
    const d = determinize(getObservation(s, other), 5);
    const guess = d.combat?.plays[0]?.token;
    expect(guess).toBeDefined();
    expect(s.players[first]!.combatTokens.hand[guess!]).toBeGreaterThan(0);
  });

  it('Из детерминизированного состояния партию можно доиграть', () => {
    const s = createGame({ playerCount: 3 }, 8);
    let d = determinize(getObservation(s, 0), 3);
    while (!isTerminal(d))
      d = applyAction(d, getLegalActions(d)[0] as Action, { validate: false }).state;
    expect(d.phase).toBe('gameOver');
  });
});
