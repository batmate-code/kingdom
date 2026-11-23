import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState, Position } from './types';
import { edit, moveWorker, newGame, passAll, setWorker } from './testing';

const slot1 = (location: 'mine' | 'witchCircle' | 'lair' | 'mass' | 'chancery'): Position => ({
  kind: 'slot',
  location,
  slot: 1,
});

/** Расставить рабочих и провести бои (все пасуют). */
function fight(setup: (s: GameState) => GameState, rules = {}) {
  const log: GameEvent[] = [];
  const s = passAll(setup(newGame({ rules })), log);
  const combats = log.flatMap((e) => (e.type === 'combatResolved' ? [e] : []));
  return { s, log, combats, forest: combats.find((c) => c.region === 'forest') };
}

describe('Бои', () => {
  it('Бои идут в порядке Лес → Долина → Город', () => {
    const { combats } = fight((s) => s);
    expect(combats.map((c) => c.region)).toEqual(['forest', 'valley', 'city']);
  });

  it('Побеждает максимальная сила; Шпион даёт силу 2', () => {
    const { forest } = fight((s) => {
      s = moveWorker(s, 'p0w0', slot1('mine'));
      s = moveWorker(s, 'p1w0', slot1('witchCircle'));
      return setWorker(s, 'p1w0', { profession: 'spy' });
    });
    expect(forest?.strengths).toEqual([
      { player: 0, strength: 1, workers: 1 },
      { player: 1, strength: 2, workers: 1 },
    ]);
    expect(forest?.winner).toBe(1);
  });

  it('При равной силе побеждает тот, у кого больше рабочих', () => {
    const { forest } = fight((s) => {
      s = moveWorker(s, 'p0w0', slot1('mine'));
      s = moveWorker(s, 'p0w1', slot1('lair'));
      s = moveWorker(s, 'p1w0', slot1('witchCircle'));
      return setWorker(s, 'p1w0', { profession: 'spy' });
    });
    expect(forest?.winner).toBe(0);
  });

  it('Равны и сила, и число рабочих — победителя нет', () => {
    const { forest, s } = fight((s) => {
      s = moveWorker(s, 'p0w0', slot1('mine'));
      return moveWorker(s, 'p1w0', slot1('witchCircle'));
    });
    expect(forest?.winner).toBeNull();
    expect(s.players.map((p) => p.influence.forest)).toEqual([0, 0, 0]);
  });

  it('Автор 23.11: рабочие во вторых слотах дают участие в бою, но не силу', () => {
    const { forest } = fight((s) => {
      s = moveWorker(s, 'p0w0', { kind: 'slot', location: 'mine', slot: 2 });
      s = moveWorker(s, 'p0w1', { kind: 'slot', location: 'lair', slot: 2 });
      return moveWorker(s, 'p1w0', slot1('witchCircle'));
    });
    // Участвует, но сила только от первых слотов (у p0 — 0 без жетона боя).
    expect(forest?.strengths.map((x) => x.player)).toEqual([0, 1]);
    expect(forest?.winner).toBe(1);
  });

  it('Рабочие в госпитале не участвуют в бою', () => {
    const { forest } = fight((s) => {
      s = moveWorker(s, 'p0w0', { kind: 'hospital' });
      return moveWorker(s, 'p1w0', slot1('mine'));
    });
    expect(forest?.strengths.map((x) => x.player)).toEqual([1]);
  });

  it('Без рабочих в регионе игрок в бою не участвует (ответ автора 5)', () => {
    const { forest } = fight((s) =>
      edit(moveWorker(s, 'p1w0', slot1('mine')), (d) => {
        d.powerTokens.push({ owner: 0, region: 'forest', count: 3 });
      }),
    );
    expect(forest?.strengths.map((x) => x.player)).toEqual([1]);
    expect(forest?.winner).toBe(1);
  });

  it('Жетоны силы участника прибавляются к силе', () => {
    const { forest } = fight((s) =>
      edit(moveWorker(moveWorker(s, 'p0w0', slot1('mine')), 'p1w0', slot1('witchCircle')), (d) => {
        d.powerTokens.push({ owner: 0, region: 'forest', count: 2 });
      }),
    );
    expect(forest?.winner).toBe(0);
  });

  it('Награда победителю: +1 влияние и ещё +1 влияние (право стройки появится на этапе 4)', () => {
    const { s } = fight((s) => moveWorker(s, 'p2w0', slot1('mass')));
    expect(s.players[2]?.influence.valley).toBe(2);
  });

  it('Автор 23.11 (вместо OQ-3): единственный рабочий во втором слоте — участник боя и побеждает', () => {
    const { forest } = fight((s: GameState) =>
      moveWorker(s, 'p0w0', { kind: 'slot', location: 'mine', slot: 2 }),
    );
    expect(forest?.strengths.map((x) => x.player)).toEqual([0]);
    expect(forest?.winner).toBe(0);
  });
});
