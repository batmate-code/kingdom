import { PROFESSION_ORDER } from '@vampire/data';
import { describe, expect, it } from 'vitest';
import type { GameConfigInput, GameState } from './index';
import { applyAction, createGame, getLegalActions } from './engine';

/** Доиграть первыми допустимыми ходами до начала раунда `round`. */
function toRound(config: GameConfigInput, round: number, seed = 3): GameState {
  let s = createGame(config, seed);
  for (let i = 0; i < 5000 && s.round < round; i++) {
    s = applyAction(s, getLegalActions(s)[0]!).state;
  }
  return s;
}

const tokens = (s: GameState) => Object.values(s.locations).map((l) => l.professionToken);

describe('Жетоны профессий локаций (автор, 23.11)', () => {
  it('по умолчанию раскладываются один раз: во 2-м и 4-м раунде те же', () => {
    const first = tokens(createGame({}, 3));
    expect(tokens(toRound({}, 2))).toEqual(first);
    expect(tokens(toRound({}, 4))).toEqual(first);
  });

  it('переключатель professionTokensOnce=false: раскладка каждый раунд (прежнее правило)', () => {
    const config = { rules: { professionTokensOnce: false } };
    const rounds = [1, 2, 3, 4].map((r) => tokens(toRound(config, r)));
    expect(new Set(rounds.map((t) => t.join())).size).toBeGreaterThan(1);
  });
});

describe('Драфт по числу игроков (эксперимент автора 23.11, draftSize=players)', () => {
  it('по умолчанию 5 персонажей и 5 разных профессий', () => {
    const s = createGame({}, 3);
    expect(s.offer.characters).toHaveLength(5);
    expect([...s.offer.professions].sort()).toEqual([...PROFESSION_ORDER].sort());
  });

  it('игроков + 1 персонажей и столько же случайных профессий, повторы возможны', () => {
    for (const playerCount of [2, 3, 4]) {
      const s = createGame({ playerCount, rules: { draftSize: 'players' } }, 7);
      expect(s.offer.characters).toHaveLength(playerCount + 1);
      expect(s.offer.professions).toHaveLength(playerCount + 1);
    }
    const repeats = Array.from({ length: 40 }, (_, seed) =>
      createGame({ rules: { draftSize: 'players' } }, seed),
    ).some((s) => new Set(s.offer.professions).size < s.offer.professions.length);
    expect(repeats).toBe(true);
  });
});
