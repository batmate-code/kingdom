/** Ответы автора 23.11: Доминацию нельзя играть, если в регионе нет соперников. */
import type { LocationId } from '@vampire/data';
import { describe, expect, it } from 'vitest';
import { getLegalActions } from './engine';
import type { Action, GameState, Position } from './types';
import { act, edit, moveWorker, newGame } from './testing';

const at = (location: LocationId, slot: 1 | 2 = 1): Position => ({ kind: 'slot', location, slot });

/** Все пасуют до первого выбора жетона боя в Лесу. */
function toForestToken(s: GameState): GameState {
  while (s.pending && !(s.pending.kind === 'combatToken' && s.pending.region === 'forest')) {
    const action: Action =
      s.pending.kind === 'placement' ? { type: 'pass' } : (getLegalActions(s)[0] as Action);
    s = act(s, action);
  }
  return s;
}

const tokens = (s: GameState) =>
  getLegalActions(s).flatMap((a) => (a.type === 'combatToken' ? [a.token] : []));

describe('Жетоны боя: Доминация (автор, 23.11)', () => {
  it('Доминация: один в регионе — играть нельзя', () => {
    const s = toForestToken(moveWorker(newGame(), 'p0w0', at('mine')));
    expect(s.pending).toMatchObject({ kind: 'combatToken', player: 0 });
    expect(tokens(s)).not.toContain('domination');
    expect(tokens(s)).toContain('attack');
  });

  it('Доминация: есть соперник в регионе — играть можно', () => {
    let s = moveWorker(newGame(), 'p0w0', at('mine'));
    s = moveWorker(s, 'p1w0', at('witchCircle'));
    s = toForestToken(s);
    expect(tokens(s)).toContain('domination');
  });

  it('Доминация: один в регионе и в руке только она — жетон не кладётся', () => {
    let s = moveWorker(newGame(), 'p0w0', at('mine'));
    s = edit(s, (d) => {
      // Всё, кроме Доминации, уже в сбросе.
      const { hand, discard } = d.players[0]!.combatTokens;
      for (const t of Object.keys(hand) as (keyof typeof hand)[]) {
        if (t === 'domination') continue;
        discard[t] += hand[t];
        hand[t] = 0;
      }
    });
    while (s.pending && s.phase !== 'draft' && s.pending.kind !== 'upkeep') {
      expect(s.pending.kind === 'combatToken' && s.pending.player === 0).toBe(false);
      const action: Action =
        s.pending.kind === 'placement' ? { type: 'pass' } : (getLegalActions(s)[0] as Action);
      s = act(s, action);
    }
  });
});
