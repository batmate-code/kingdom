import { describe, expect, it } from 'vitest';
import { createGame, createGameWithEvents, getLegalActions } from './engine';
import { findInvariantViolations } from './invariants';
import type { Action, GameState } from './types';
import { act, edit, moveWorker, newGame, place, setWorker, turnTo } from './testing';

describe('Инварианты ловят испорченное состояние', () => {
  const ok = newGame();

  it('в исправном состоянии нарушений нет', () => {
    expect(findInvariantViolations(ok)).toEqual([]);
  });

  it('потерянная карта персонажа', () => {
    const s = edit(ok, (d) => {
      d.deck.pop();
    });
    expect(findInvariantViolations(s).join()).toMatch(/карт персонажей/);
  });

  it('дубль карты персонажа', () => {
    const s = edit(ok, (d) => {
      d.discard.push(d.deck[0]!);
    });
    expect(findInvariantViolations(s).join()).toMatch(/карт персонажей/);
  });

  it('персонаж без профессии', () => {
    const s = edit(ok, (d) => {
      d.workers[0]!.character = d.deck.shift()!;
    });
    expect(findInvariantViolations(s).join()).toMatch(/персонаж без профессии/);
  });

  it('отрицательный ресурс и влияние выше трека', () => {
    const s = edit(ok, (d) => {
      d.players[0]!.resources.gold = -1;
      d.players[1]!.influence.forest = 7;
    });
    expect(findInvariantViolations(s)).toHaveLength(2);
  });

  it('два рабочих в одном слоте и рабочий в закрытом слоте', () => {
    let s = moveWorker(ok, 'p0w0', { kind: 'slot', location: 'mine', slot: 1 });
    s = moveWorker(s, 'p1w0', { kind: 'slot', location: 'mine', slot: 1 });
    s = moveWorker(s, 'p2w0', { kind: 'slot', location: 'lair', slot: 2 });
    s = edit(s, (d) => {
      d.locations.lair.slot2Locked = true;
    });
    expect(findInvariantViolations(s)).toHaveLength(2);
  });
});

describe('Нестандартное число раундов', () => {
  it('7 раундов: колода кончается, драфт пропускается, партия доигрывается', () => {
    let s: GameState = createGame({ playerCount: 3, rounds: 7 }, 3);
    let guard = 0;
    while (s.phase !== 'gameOver') {
      s = act(s, getLegalActions(s)[0] as Action);
      expect(++guard).toBeLessThan(5000);
    }
    expect(s.round).toBe(7);
    expect(s.deck).toHaveLength(0);
  });
});

describe('События начала партии', () => {
  it('createGameWithEvents отдаёт начало раунда и выкладку драфта', () => {
    const { state, events } = createGameWithEvents({ playerCount: 3 }, 1);
    expect(events.map((e) => e.type)).toEqual([
      'roundStarted',
      'professionTokensDealt',
      'draftOffered',
    ]);
    expect(state).toEqual(createGame({ playerCount: 3 }, 1));
  });
});

describe('OQ-16: Палач при переходе в первый слот вытеснением', () => {
  const setup = (rule: boolean) => {
    let s = turnTo(newGame({ rules: { executionerOnDisplacement: rule } }), 1);
    s = place(s, 'witchCircle', 1, { workerId: 'p1w0' });
    s = place(s, 'mine', 1, { workerId: 'p2w0' });
    s = edit(turnTo(s, 0), (d) => {
      d.locations.mine.professionToken = 'executioner';
    });
    s = setWorker(s, 'p0w0', { profession: 'executioner' });
    return place(s, 'mine', 2, { workerId: 'p0w0', displace: true });
  };

  it('по умолчанию (автор) не срабатывает', () => {
    expect(setup(false).pending?.kind).not.toBe('executioner');
  });

  it('с переключателем срабатывает', () => {
    expect(setup(true).pending).toEqual({ kind: 'executioner', player: 0, workerId: 'p0w0' });
  });
});
