import { DRAFT_BY_PLAYERS, PROFESSION_ORDER } from '@vampire/data';
import { describe, expect, it } from 'vitest';
import type { GameConfigInput, GameState } from './index';
import { applyAction, createGame, getLegalActions } from './engine';
import { findInvariantViolations } from './invariants';
import { act, edit, newGame, place, setWorker, turnTo } from './testing';

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
  it('professionTokensReroll=false: раскладываются один раз — во 2-м и 4-м раунде те же', () => {
    const config = { rules: { professionTokensReroll: false } };
    const first = tokens(createGame(config, 3));
    expect(tokens(toRound(config, 2))).toEqual(first);
    expect(tokens(toRound(config, 4))).toEqual(first);
  });

  it('по умолчанию (автор 24.11): заново после возврата жетонов боя — в 3-м и 5-м раунде', () => {
    const first = tokens(createGame({}, 3));
    expect(tokens(toRound({}, 2))).toEqual(first);
    const third = tokens(toRound({}, 3));
    expect(third).not.toEqual(first);
    expect(tokens(toRound({}, 4))).toEqual(third);
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

describe('Пул профессий для драфта по числу игроков (автор, 22.11)', () => {
  const players = { rules: { draftSize: 'players' as const } };
  const count = (list: readonly string[], prof: string) => list.filter((x) => x === prof).length;
  const total = PROFESSION_ORDER.length * DRAFT_BY_PLAYERS.copiesPerProfession;

  it('в пуле 30 жетонов, по 6 каждой профессии; драфт тянет из пула без возврата', () => {
    const s = createGame(players, 7);
    expect(s.offer.professions).toHaveLength(4);
    expect(s.professionPool.length + s.offer.professions.length).toBe(total);
    for (const prof of PROFESSION_ORDER) {
      expect(count(s.professionPool, prof) + count(s.offer.professions, prof)).toBe(
        DRAFT_BY_PLAYERS.copiesPerProfession,
      );
    }
  });

  it('в правилах по умолчанию пул не используется', () => {
    expect(createGame({}, 7).professionPool).toEqual([]);
  });

  it('сброс пары на улучшении возвращает профессию в пул', () => {
    let s = createGame(players, 7);
    for (let i = 0; i < 50 && s.pending?.kind !== 'upgrade'; i++) {
      s = applyAction(s, getLegalActions(s)[0]!).state;
    }
    expect(s.pending?.kind).toBe('upgrade');
    const player = s.pending!.player;
    const prof = s.players[player]!.draftPick.profession!;
    const before = count(s.professionPool, prof);
    s = act(s, { type: 'upgrade', choice: { kind: 'discard' } });
    expect(count(s.professionPool, prof)).toBe(before + 1);
  });

  it('невзятые на драфте профессии возвращаются в пул в конце раунда', () => {
    const s = toRound(players, 2);
    expect(findInvariantViolations(s)).toEqual([]);
    expect(s.professionPool.length + s.offer.professions.length).toBe(
      total -
        s.workers.filter((w) => w.profession).length -
        s.players.filter((p) => p.draftPick.profession).length,
    );
  });

  it('партия первыми допустимыми ходами доходит до конца, жетоны профессий не теряются', () => {
    for (const seed of [1, 2, 3]) {
      let s = createGame({ ...players, checkInvariants: true }, seed);
      for (let i = 0; i < 5000 && s.phase !== 'gameOver'; i++) {
        s = applyAction(s, getLegalActions(s)[0]!).state;
      }
      expect(s.phase).toBe('gameOver');
      expect(findInvariantViolations(s)).toEqual([]);
    }
  });

  it('Лицемер при драфте по пулу берёт новую профессию из пула и возвращает старую', () => {
    let s = setWorker(turnTo(newGame(players), 0), 'p0w0', {
      character: 'hypocrite',
      profession: 'guard',
    });
    // Все Шпионы — на драфте (в пуле Таверны): Лицемеру взять Шпиона неоткуда.
    s = edit(s, (d) => {
      d.professionPool = d.professionPool.filter((p) => p !== 'spy');
      d.offer.professions.push(
        ...Array.from({ length: DRAFT_BY_PLAYERS.copiesPerProfession }, () => 'spy' as const),
      );
    });
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    const options = getLegalActions(s).flatMap((a) =>
      a.type === 'character' && a.choice.kind === 'hypocrite' ? [a.choice.profession] : [],
    );
    expect(options).not.toContain('spy');
    expect(options).toContain('architect');
    const guards = count(s.professionPool, 'guard');
    const architects = count(s.professionPool, 'architect');
    s = act(s, {
      type: 'character',
      choice: { kind: 'hypocrite', workerId: 'p0w0', profession: 'architect' },
    });
    expect(count(s.professionPool, 'guard')).toBe(guards + 1);
    expect(count(s.professionPool, 'architect')).toBe(architects - 1);
    expect(findInvariantViolations(s)).toEqual([]);
  });
});
