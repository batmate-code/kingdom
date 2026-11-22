import { describe, expect, it } from 'vitest';
import { cityEntryCost } from './economy';
import type { GameEvent, GameState } from './types';
import {
  choose,
  edit,
  locationOptions,
  newGame,
  passAll,
  place,
  placeActions,
  res,
  setResources,
  setWorker,
  turnTo,
} from './testing';

const CITY = ['chancery', 'underground', 'commissariat', 'cityHall'];
const start = () => turnTo(newGame(), 0);
const cityPlacements = (s: GameState) => placeActions(s).filter((a) => CITY.includes(a.location));
const copyTargets = (s: GameState) =>
  locationOptions(s).flatMap((o) => (o.kind === 'copy' ? [o.location] : []));

describe('Вход в Город', () => {
  it('Базово стоит 1 золото, платится при выставлении рабочего в Город', () => {
    const log: GameEvent[] = [];
    const s = place(start(), 'chancery', 1, { log });
    expect(res(s, 0).gold).toBe(1);
    expect(log).toContainEqual({ type: 'cityEntryPaid', player: 0, cost: 1, resource: 'gold' });
  });

  it('Без золота на вход в Город не выставить', () => {
    const s = setResources(start(), 0, { gold: 0 });
    expect(cityPlacements(s)).toEqual([]);
  });

  it('Аристократ входит бесплатно', () => {
    let s = setResources(start(), 0, { gold: 0 });
    s = setWorker(s, 'p0w0', { profession: 'aristocrat' });
    expect(cityPlacements(s).length).toBeGreaterThan(0);
    s = place(s, 'chancery', 1, { workerId: 'p0w0' });
    expect(res(s, 0).gold).toBe(0);
  });

  it('Первое достижение 5 влияния в Лесу и в Долине поднимает цену на 1; каждый рубеж срабатывает один раз', () => {
    let s = edit(start(), (d) => {
      const [p0, p1] = d.players;
      if (!p0 || !p1) throw new Error('нет игроков');
      p0.influence.forest = 4;
      p0.influence.valley = 4;
      p1.influence.forest = 4;
    });
    s = setResources(s, 0, { gold: 5, ore: 3 });
    s = setResources(s, 1, { gold: 5, ore: 1 });
    expect(cityEntryCost(s)).toBe(1);

    // Игрок 0, Ратуша: 1 руда → 1 влияние в Лес (4 → 5).
    s = place(s, 'cityHall', 1);
    s = choose(s, { kind: 'cityHall', offer: 0, region: 'forest' });
    expect(cityEntryCost(s)).toBe(2);

    // Игрок 1 тоже доходит до 5 в Лесу (через Подполье) — рубеж Леса уже сработал.
    s = place(s, 'underground', 1);
    s = choose(s, { kind: 'copy', location: 'cityHall', slot: 1 });
    s = choose(s, { kind: 'cityHall', offer: 0, region: 'forest' });
    expect(s.players[1]?.influence.forest).toBe(5);
    expect(cityEntryCost(s)).toBe(2);

    // Игрок 0, второй слот Ратуши: 2 руды → 1 влияние в Долину (4 → 5).
    s = turnTo(s, 0);
    s = place(s, 'cityHall', 2);
    s = choose(s, { kind: 'cityHall', offer: 0, region: 'valley' });
    expect(cityEntryCost(s)).toBe(3);
    expect(res(s, 0).gold).toBe(5 - 1 - 2);
  });

  it('Цена не превышает 3', () => {
    const s = edit(start(), (d) => {
      d.cityEntryRaisedRegions = ['forest', 'valley'];
    });
    expect(cityEntryCost(s)).toBe(3);
  });
});

describe('Подполье', () => {
  it('1 золото за копирование сверх входа в Город', () => {
    let s = place(start(), 'underground', 1);
    s = choose(s, { kind: 'copy', location: 'mine', slot: 1 });
    expect(res(s, 0).gold).toBe(2 - 1 - 1 + 3);
  });

  it('Можно скопировать занятый первый слот', () => {
    let s = place(start(), 'mine', 1);
    s = place(s, 'underground', 1);
    s = choose(s, { kind: 'copy', location: 'mine', slot: 1 });
    expect(res(s, 1).gold).toBe(2 - 1 - 1 + 3);
  });

  it('Копирование не считается посещением: копилка Логова всё равно растёт', () => {
    let s = place(start(), 'underground', 1);
    s = choose(s, { kind: 'copy', location: 'lair', slot: 1 });
    expect(res(s, 0).ore).toBe(1);
    s = passAll(s);
    expect(s.lair.stash).toBe(1);
  });

  it('Первый слот: любое действие, кроме Подполья (Город тоже можно)', () => {
    const targets = copyTargets(place(start(), 'underground', 1));
    expect(targets).not.toContain('underground');
    expect(targets).toContain('cityHall');
    expect(targets).toContain('mine');
  });

  it('Второй слот: только действия Леса и Долины', () => {
    const targets = copyTargets(place(start(), 'underground', 2));
    expect(targets).toContain('mine');
    expect(targets).toContain('tavern');
    expect(targets.some((t) => CITY.includes(t))).toBe(false);
  });

  it('Без золота на копирование остаётся только пропуск', () => {
    const s = place(setResources(start(), 0, { gold: 1 }), 'underground', 1);
    // Вход съел последнее золото — копировать нечем, действие пропускается автоматически.
    expect(s.pending).toEqual({ kind: 'placement', player: 1 });
    expect(res(s, 0).gold).toBe(0);
  });
});
