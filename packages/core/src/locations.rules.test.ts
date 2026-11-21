import { describe, expect, it } from 'vitest';
import type { GameState } from './types';
import {
  choose,
  edit,
  locationOptions,
  moveWorker,
  newGame,
  place,
  res,
  setResources,
  turnTo,
} from './testing';

const start = (r: Parameters<typeof setResources>[2] = {}) =>
  setResources(turnTo(newGame(), 0), 0, r);
const myTurnAgain = (s: GameState) => turnTo(s, 0);

describe('Локации Леса', () => {
  it('Рудник: +3 / +2 золота', () => {
    let s = place(start(), 'mine', 1);
    expect(res(s, 0).gold).toBe(5);
    s = place(myTurnAgain(s), 'mine', 2);
    expect(res(s, 0).gold).toBe(7);
  });

  it('Ведьмин круг: +3 / +2 крови', () => {
    let s = place(start(), 'witchCircle', 1);
    expect(res(s, 0).blood).toBe(3);
    s = place(myTurnAgain(s), 'witchCircle', 2);
    expect(res(s, 0).blood).toBe(5);
  });

  it('Логово: первый слот +1 руда, второй — забрать всю копилку (она обнуляется)', () => {
    let s = edit(start(), (d) => {
      d.lair.stash = 3;
    });
    s = place(s, 'lair', 1);
    expect(res(s, 0).ore).toBe(1);
    s = place(myTurnAgain(s), 'lair', 2);
    expect(res(s, 0).ore).toBe(4);
    expect(s.lair.stash).toBe(0);
  });

  it('Логово, второй слот (автор, 22.11): копилка + по желанию 4 крови → 1 руда, один раз (OQ-46)', () => {
    let s = edit(start({ blood: 9 }), (d) => {
      d.lair.stash = 2;
    });
    s = place(s, 'lair', 2);
    expect(locationOptions(s)).toEqual([
      { kind: 'lairStash', exchanges: 0 },
      { kind: 'lairStash', exchanges: 1 },
    ]);
    s = choose(s, { kind: 'lairStash', exchanges: 1 });
    expect(res(s, 0)).toMatchObject({ ore: 2 + 1, blood: 9 - 4 });
    expect(s.lair.stash).toBe(0);
  });

  it('Логово, второй слот: без 4 крови — только копилка', () => {
    const s = place(start({ blood: 3 }), 'lair', 2);
    // Единственный вариант выбран сам.
    expect(res(s, 0)).toMatchObject({ ore: 0, blood: 3 });
  });
});

describe('Локации Долины', () => {
  it('Месса, первый слот: одно направление до 2 раз, 1 → 3', () => {
    let s = place(start({ gold: 2, blood: 1 }), 'mass', 1);
    expect(locationOptions(s)).toEqual([
      { kind: 'mass', from: 'gold', times: 1 },
      { kind: 'mass', from: 'gold', times: 2 },
      { kind: 'mass', from: 'blood', times: 1 },
      { kind: 'skip' },
    ]);
    s = choose(s, { kind: 'mass', from: 'gold', times: 2 });
    expect(res(s, 0)).toMatchObject({ gold: 0, blood: 7 });
  });

  it('Месса, второй слот: 1 → 2', () => {
    let s = place(start({ gold: 0, blood: 2 }), 'mass', 2);
    s = choose(s, { kind: 'mass', from: 'blood', times: 2 });
    expect(res(s, 0)).toMatchObject({ gold: 4, blood: 0 });
  });

  it('Рынок, первый слот: 2 золота/крови → 1 руда (в любой комбинации)', () => {
    let s = place(start({ gold: 1, blood: 1 }), 'market', 1);
    expect(locationOptions(s)).toContainEqual({ kind: 'marketBuy', pay: { gold: 1, blood: 1 } });
    expect(locationOptions(s)).not.toContainEqual({
      kind: 'marketBuy',
      pay: { gold: 2, blood: 0 },
    });
    s = choose(s, { kind: 'marketBuy', pay: { gold: 1, blood: 1 } });
    expect(res(s, 0)).toMatchObject({ gold: 0, blood: 0, ore: 1 });
  });

  it('Рынок, первый слот: 1 руда → 4 золота/крови', () => {
    let s = place(start({ gold: 0, ore: 1 }), 'market', 1);
    s = choose(s, { kind: 'marketSell', receive: { gold: 1, blood: 3 } });
    expect(res(s, 0)).toMatchObject({ gold: 1, blood: 3, ore: 0 });
  });

  it('Рынок, второй слот: 3 → 1 руда или 1 руда → 3', () => {
    let s = place(start({ gold: 3, ore: 1 }), 'market', 2);
    expect(locationOptions(s)).toContainEqual({ kind: 'marketBuy', pay: { gold: 3, blood: 0 } });
    expect(locationOptions(s)).toContainEqual({
      kind: 'marketSell',
      receive: { gold: 0, blood: 3 },
    });
    s = choose(s, { kind: 'marketBuy', pay: { gold: 3, blood: 0 } });
    expect(res(s, 0)).toMatchObject({ gold: 0, ore: 2 });
  });

  it('Рынок: только один обмен за посещение', () => {
    const s = place(start({ gold: 2, ore: 1 }), 'market', 1);
    const s2 = choose(s, { kind: 'marketSell', receive: { gold: 4, blood: 0 } });
    expect(s2.pending).toEqual({ kind: 'placement', player: 1 });
  });

  it('Таверна, второй слот: +1 золото, +1 кровь', () => {
    const s = place(start(), 'tavern', 2);
    expect(res(s, 0)).toMatchObject({ gold: 3, blood: 1 });
  });

  it('Таверна, первый слот: рабочий без улучшения ничего не получает (ответ автора)', () => {
    const s = place(start(), 'tavern', 1);
    expect(res(s, 0)).toMatchObject({ gold: 2, blood: 0 });
    expect(s.pending).toEqual({ kind: 'placement', player: 1 });
  });
});

describe('Локации Города', () => {
  it('Канцелярия, первый слот: до 2 раз, можно смешивать: 1 компромат → 2 золота/крови или 1 руда', () => {
    let s = place(start({ gold: 1, compromat: 2 }), 'chancery', 1);
    // 4 вида конверсии: размер 1 — 4 варианта, размер 2 — 10; пропуск. Права стройки нет:
    // после входа золота 0, строить не на что (OQ-29).
    expect(locationOptions(s)).toHaveLength(4 + 10 + 1);
    s = choose(s, {
      kind: 'chancery',
      conversions: [{ to: 'goldBlood', gold: 2, blood: 0 }, { to: 'ore' }],
    });
    expect(res(s, 0)).toMatchObject({ gold: 0 + 2, ore: 1, compromat: 0 });
  });

  it('Канцелярия: с 1 компроматом — только одна конверсия', () => {
    const s = place(start({ compromat: 1 }), 'chancery', 1);
    expect(
      locationOptions(s).every((o) => o.kind !== 'chancery' || o.conversions.length === 1),
    ).toBe(true);
  });

  it('Комиссариат, второй слот: 2 руды → вернуть своего рабочего из госпиталя в запас; его можно выставить снова', () => {
    let s = moveWorker(start({ ore: 2 }), 'p0w2', { kind: 'hospital' });
    s = place(s, 'commissariat', 2, { workerId: 'p0w0' });
    expect(locationOptions(s)).toEqual([{ kind: 'revive', workerId: 'p0w2' }, { kind: 'skip' }]);
    s = choose(s, { kind: 'revive', workerId: 'p0w2' });
    expect(res(s, 0).ore).toBe(0);
    expect(s.workers.find((w) => w.id === 'p0w2')?.position).toEqual({ kind: 'reserve' });
  });

  it('Комиссариат, второй слот: нет руды или нет рабочих в госпитале — действие пропускается', () => {
    const s = place(start({ ore: 2 }), 'commissariat', 2);
    expect(s.pending).toEqual({ kind: 'placement', player: 1 });
  });

  it('Ратуша, первый слот: 1 руда → 1 влияние в любом регионе или 3 руды → 2 в одном', () => {
    let s = place(start({ ore: 3 }), 'cityHall', 1);
    expect(locationOptions(s)).toHaveLength(3 + 3 + 1);
    s = choose(s, { kind: 'cityHall', offer: 1, region: 'valley' });
    expect(s.players[0]?.influence.valley).toBe(2);
    expect(res(s, 0).ore).toBe(0);
  });

  it('Ратуша, второй слот: 2 руды → 1 влияние или 4 руды → 2 в одном регионе', () => {
    let s = place(start({ ore: 4 }), 'cityHall', 2);
    s = choose(s, { kind: 'cityHall', offer: 1, region: 'city' });
    expect(s.players[0]?.influence.city).toBe(2);
    expect(res(s, 0).ore).toBe(0);
  });

  it('Влияние не превышает максимум трека', () => {
    let s = edit(start({ ore: 3 }), (d) => {
      (d.players[0] as (typeof d.players)[number]).influence.forest = 5;
    });
    s = place(s, 'cityHall', 1);
    s = choose(s, { kind: 'cityHall', offer: 1, region: 'forest' });
    expect(s.players[0]?.influence.forest).toBe(6);
    expect(s.firstToMax.forest).toBe(0);
  });
});

describe('OQ-1: обмены необязательны', () => {
  it('По умолчанию обмен можно пропустить; с переключателем — нельзя, если он доступен', () => {
    const opts = (optional: boolean) => {
      let s = turnTo(newGame({ rules: { locationActionOptional: optional } }), 0);
      s = place(s, 'mass', 1);
      return locationOptions(s);
    };
    expect(opts(true)).toContainEqual({ kind: 'skip' });
    expect(opts(false)).not.toContainEqual({ kind: 'skip' });
  });
});
