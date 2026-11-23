import { DISPLACEMENT } from '@vampire/data';
import { describe, expect, it } from 'vitest';
import { upkeepTier } from './draft';
import { getLegalActions } from './engine';
import type { GameEvent, GameState } from './types';
import {
  act,
  choose,
  edit,
  locationOptions,
  moveWorker,
  newGame,
  place,
  res,
  setWorker,
  turnTo,
} from './testing';

/** Пул Таверны: два персонажа и две профессии. */
function withTavernPool(s: GameState): GameState {
  return edit(s, (d) => {
    d.deck = d.deck.filter((c) => c !== 'oreMiner' && c !== 'diplomat');
    d.offer = { characters: ['oreMiner', 'diplomat'], professions: ['spy', 'guard'] };
  });
}

describe('Таверна, первый слот', () => {
  const start = () =>
    withTavernPool(
      setWorker(turnTo(newGame(), 0), 'p0w0', { profession: 'aristocrat', character: 'officer' }),
    );

  it('Предлагает любую пару из оставшихся после драфта (2 × 2) или пропуск', () => {
    const s = place(start(), 'tavern', 1, { workerId: 'p0w0' });
    expect(locationOptions(s)).toHaveLength(2 * 2 + 1);
  });

  it('Автор 23.11: за старую пару — отступные; старая пара возвращается в пул', () => {
    const before = start();
    let s = place(before, 'tavern', 1, { workerId: 'p0w0' });
    s = choose(s, { kind: 'tavernSwap', character: 'diplomat', profession: 'spy' });
    expect(s.workers.find((w) => w.id === 'p0w0')).toMatchObject({
      character: 'diplomat',
      profession: 'spy',
    });
    expect(s.offer.characters).toEqual(expect.arrayContaining(['oreMiner', 'officer']));
    expect(s.offer.professions).toEqual(expect.arrayContaining(['aristocrat', 'guard']));
    const old = before.workers.find((w) => w.id === 'p0w0')!.character!;
    const severance = upkeepTier(old).severance;
    const was = res(before, 0);
    expect(res(s, 0)).toEqual({
      gold: was.gold + (severance.gold ?? 0),
      blood: was.blood + (severance.blood ?? 0),
      ore: was.ore + (severance.ore ?? 0),
      compromat: was.compromat + (severance.compromat ?? 0),
    });
  });

  it('Рабочий без улучшения бесплатно берёт пару из пула (ответ автора, 22.11)', () => {
    let s = place(withTavernPool(turnTo(newGame(), 0)), 'tavern', 1, { workerId: 'p0w0' });
    expect(locationOptions(s)).toHaveLength(2 * 2 + 1);
    s = choose(s, { kind: 'tavernSwap', character: 'diplomat', profession: 'spy' });
    const w = s.workers.find((x) => x.id === 'p0w0');
    expect(w).toMatchObject({ character: 'diplomat', profession: 'spy' });
    // Пара ушла из пула, взамен ничего не вернулось.
    expect(s.offer).toEqual({ characters: ['oreMiner'], professions: ['guard'] });
    // Новый персонаж в этом размещении не сработал (Дипломат дал бы влияние).
    expect(s.players[0]?.influence.valley).toBe(0);
  });

  it('Пустой пул — заменить не на что', () => {
    let s = edit(start(), (d) => {
      d.deck.push(...d.offer.characters);
      d.offer = { characters: [], professions: [] };
    });
    s = place(s, 'tavern', 1, { workerId: 'p0w0' });
    expect(s.pending).toEqual({ kind: 'placement', player: 1 });
  });

  it('Через Подполье меняется пара копирующего рабочего', () => {
    let s = place(start(), 'underground', 1, { workerId: 'p0w0' });
    s = choose(s, { kind: 'copy', location: 'tavern', slot: 1 });
    s = choose(s, { kind: 'tavernSwap', character: 'oreMiner', profession: 'guard' });
    expect(s.workers.find((w) => w.id === 'p0w0')?.character).toBe('oreMiner');
  });
});

describe('Палач', () => {
  /** p1 стоит в Ведьмином круге (слот 1), p0 — Палач. */
  const setup = () => {
    let s = turnTo(newGame(), 1);
    s = place(s, 'witchCircle', 1, { workerId: 'p1w0' });
    s = turnTo(s, 0);
    return setWorker(s, 'p0w0', { profession: 'executioner' });
  };

  it('При размещении в первый слот может вытеснить чужого рабочего из другой локации региона', () => {
    let s = place(setup(), 'mine', 1, { workerId: 'p0w0' });
    expect(s.pending).toEqual({ kind: 'executioner', player: 0, workerId: 'p0w0' });
    expect(getLegalActions(s)).toEqual([
      { type: 'executioner', target: 'p1w0' },
      { type: 'executioner', target: null },
    ]);
    const log: GameEvent[] = [];
    s = act(s, { type: 'executioner', target: 'p1w0' }, log);
    expect(s.workers.find((w) => w.id === 'p1w0')?.position).toEqual({ kind: 'hospital' });
    // Автор 23.11: владелец вытесненного и сам Палач — по 1 компромату; замка нет.
    expect(res(s, 1).compromat).toBe(DISPLACEMENT.executionerCompensation);
    expect(res(s, 0).compromat).toBe(DISPLACEMENT.executionerReward);
    expect(s.locations.witchCircle.slot2Locked).toBe(false);
    expect(log).toContainEqual(
      expect.objectContaining({ type: 'workerDisplaced', method: 'executioner' }),
    );
  });

  it('OQ-21 (автор): сначала действие локации, потом Палач (персонаж → локация → профессия)', () => {
    const log: GameEvent[] = [];
    const s = place(setup(), 'mine', 1, { workerId: 'p0w0', log });
    expect(res(s, 0).gold).toBe(2 + 3);
    expect(s.pending?.kind).toBe('executioner');
  });

  it('Вытеснять по желанию: можно отказаться', () => {
    let s = place(setup(), 'mine', 1, { workerId: 'p0w0' });
    s = act(s, { type: 'executioner', target: null });
    expect(s.workers.find((w) => w.id === 'p1w0')?.position.kind).toBe('slot');
  });

  it('Не срабатывает во втором слоте', () => {
    const s = place(setup(), 'mine', 2, { workerId: 'p0w0' });
    expect(s.pending?.kind).toBe('placement');
  });

  it('Только чужие рабочие, только в другой локации того же региона, не Страж', () => {
    let s = setup();
    s = moveWorker(s, 'p0w1', { kind: 'slot', location: 'lair', slot: 1 }); // свой
    s = moveWorker(s, 'p2w0', { kind: 'slot', location: 'mass', slot: 1 }); // другой регион
    s = setWorker(s, 'p1w0', { profession: 'guard' }); // Страж
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    // Целей нет — решение принимается автоматически.
    expect(s.pending?.kind).toBe('placement');
  });

  it('OQ-15: рабочих во вторых слотах — только с переключателем', () => {
    const targets = (allow: boolean) => {
      let s = turnTo(newGame({ rules: { executionerTargetsSecondSlot: allow } }), 0);
      s = moveWorker(s, 'p1w0', { kind: 'slot', location: 'witchCircle', slot: 2 });
      s = setWorker(s, 'p0w0', { profession: 'executioner' });
      s = place(s, 'mine', 1, { workerId: 'p0w0' });
      return s.pending?.kind === 'executioner' ? getLegalActions(s).length - 1 : 0;
    };
    expect(targets(false)).toBe(0);
    expect(targets(true)).toBe(1);
  });
});
