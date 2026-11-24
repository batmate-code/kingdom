import { PRESTIGE_TRACK } from '@vampire/data';
/** Аудит этапа 4: сценарии по правилам «Здания и участки», «Влияние и престиж», «Конец игры». */
import type { BuildingId, RegionId } from '@vampire/data';
import { describe, expect, it } from 'vitest';
import { getLegalActions } from './engine';
import { getScores } from './scores';
import { upkeepCost } from './upkeep';
import type { BuildChoice, GameState } from './types';
import {
  act,
  edit,
  moveWorker,
  newGame,
  place,
  res,
  setResources,
  setWorker,
  turnTo,
} from './testing';

const buildChoices = (s: GameState): BuildChoice[] =>
  getLegalActions(s).flatMap((a) => (a.type === 'build' && a.choice ? [a.choice] : []));

const withBuilding = (
  s: GameState,
  type: BuildingId,
  owner: number,
  region: RegionId,
  plot: string | null,
) =>
  edit(s, (d) => {
    d.buildings.push({ type, owner, region, plot });
  });

const chanceryRight = (s: GameState) =>
  edit(s, (d) => {
    d.pending = { kind: 'build', player: 0, source: { kind: 'chancery' } };
    d.tasks.unshift({ t: 'placementTurn', first: true });
  });

describe('Аудит этапа 4: здания и престиж', () => {
  // rules.md «Здания», Цитадель: «+10 престижа при постройке».
  it('OQ-32 (автор): у игрока не больше одной Цитадели; каждая даёт построившему +10', () => {
    let s = setResources(turnTo(newGame(), 0), 0, { gold: 14, ore: 6 });
    s = edit(s, (d) => {
      d.players[0]!.influence = { forest: 4, valley: 4, city: 0 };
      d.players[1]!.influence.valley = 4;
    });
    s = chanceryRight(s);
    s = act(s, { type: 'build', choice: { building: 'citadel', region: 'forest', plot: null } });
    expect(s.players[0]?.prestige).toBe(10);
    s = chanceryRight(turnTo(s, 0));
    expect(buildChoices(s).some((c) => c.building === 'citadel')).toBe(false);
  });

  it('Торговая лавка на двойном участке Города (автор 23.11): 3 золота + 1 руда, без доплаты', () => {
    let s = setResources(turnTo(newGame(), 0), 0, { gold: 3, ore: 1 });
    s = chanceryRight(s);
    expect(buildChoices(s)).toContainEqual({
      building: 'shop',
      region: 'city',
      plot: 'city-commissariat-cityHall',
    });
    s = act(s, {
      type: 'build',
      choice: { building: 'shop', region: 'city', plot: 'city-commissariat-cityHall' },
    });
    expect(res(s, 0)).toMatchObject({ gold: 0, ore: 0 });
    expect(s.players[0]?.prestige).toBe(5);
  });

  it('Двойной участок Леса не предлагается без золота на доплату (по картону)', () => {
    const s = chanceryRight(setResources(turnTo(newGame(), 0), 0, { gold: 3, ore: 1 }));
    const plots = buildChoices(s)
      .filter((c) => c.building === 'shop')
      .map((c) => c.plot);
    expect(plots).toContain('forest-mine');
    expect(plots).toContain('city-commissariat-cityHall');
    expect(plots).not.toContain('forest-mine-lair');
  });

  it('Престиж ограничен треком 40', () => {
    let s = setResources(turnTo(newGame(), 0), 0, { gold: 2 });
    s = edit(s, (d) => {
      d.players[0]!.prestige = PRESTIGE_TRACK.max - 1;
      d.buildings.push(
        { type: 'crypt', owner: 0, region: 'forest', plot: 'forest-lair' },
        { type: 'crypt', owner: 0, region: 'forest', plot: 'forest-mine' },
      );
    });
    s = act(chanceryRight(s), {
      type: 'build',
      choice: { building: 'crypt', region: 'valley', plot: 'valley-mass' },
    });
    expect(s.players[0]?.prestige).toBe(PRESTIGE_TRACK.max);
  });

  it('Награда за бой: Цитадель только в регионе боя', () => {
    let s = setResources(turnTo(newGame(), 0), 0, { gold: 7, ore: 3 });
    s = edit(s, (d) => {
      d.players[0]!.influence = { forest: 4, valley: 4, city: 6 };
      d.pending = { kind: 'combatReward', player: 0, region: 'forest' };
    });
    s = act(s, { type: 'combatReward', choice: 'build' });
    expect(buildChoices(s)).toContainEqual({ building: 'citadel', region: 'forest', plot: null });
    expect(buildChoices(s).every((c) => c.region === 'forest')).toBe(true);
  });

  it('Аббатство на двойном участке реагирует на вытеснение из любой из двух локаций', () => {
    let s = withBuilding(newGame(), 'abbey', 2, 'forest', 'forest-mine-lair');
    s = moveWorker(s, 'p1w0', { kind: 'slot', location: 'lair', slot: 1 });
    s = edit(turnTo(s, 0), (d) => {
      d.locations.lair.professionToken = 'guard';
    });
    s = setWorker(s, 'p0w0', { profession: 'guard' });
    s = place(s, 'lair', 2, { workerId: 'p0w0', displace: true });
    expect(res(s, 2).blood).toBe(2);
  });

  it('Аббатство: несоседняя локация крови не даёт', () => {
    let s = withBuilding(newGame(), 'abbey', 2, 'forest', 'forest-mine');
    s = moveWorker(s, 'p1w0', { kind: 'slot', location: 'lair', slot: 1 });
    s = edit(turnTo(s, 0), (d) => {
      d.locations.lair.professionToken = 'guard';
    });
    s = setWorker(s, 'p0w0', { profession: 'guard' });
    s = place(s, 'lair', 2, { workerId: 'p0w0', displace: true });
    expect(res(s, 2).blood).toBe(0);
  });

  it('Лавка: приход чужого рабочего во второй слот соседней локации тоже платит', () => {
    let s = withBuilding(turnTo(newGame(), 0), 'shop', 1, 'valley', 'valley-market');
    s = place(s, 'market', 2);
    expect(res(s, 1).gold).toBe(2 + 1);
  });

  it('Цитадель Города: приход своего рабочего в Город компромата владельцу не даёт', () => {
    let s = withBuilding(turnTo(newGame(), 0), 'citadel', 0, 'city', null);
    s = setResources(s, 0, { gold: 5 });
    const before = res(s, 0).compromat;
    s = place(s, 'cityHall', 1);
    expect(res(s, 0).compromat).toBe(before);
  });

  it('Цитадель Долины и госпиталь: скидки складываются, не ниже 0', () => {
    let s = withBuilding(newGame(), 'citadel', 0, 'valley', null);
    s = setWorker(s, 'p0w0', { profession: 'guard', character: 'officer' }); // содержание 2
    const w = () => s.workers.find((x) => x.id === 'p0w0')!;
    expect(upkeepCost(s, w())).toBe(1);
    s = moveWorker(s, 'p0w0', { kind: 'hospital' });
    expect(upkeepCost(s, w())).toBe(0);
  });

  it('Цитадель Долины: скидка только владельцу', () => {
    let s = withBuilding(newGame(), 'citadel', 1, 'valley', null);
    s = setWorker(s, 'p0w0', { profession: 'guard', character: 'officer' });
    expect(
      upkeepCost(
        s,
        s.workers.find((x) => x.id === 'p0w0')!,
      ),
    ).toBe(2);
  });
});

describe('Аудит этапа 4: подсчёт и тай-брейк', () => {
  it('Максимум ПО игрока — 18 (7 влияние + 3 первенство + 8 престиж)', () => {
    const s = edit(newGame(), (d) => {
      d.players[0]!.prestige = 40;
      d.players[0]!.influence = { forest: 6, valley: 6, city: 8 };
      d.firstToMax = { forest: 0, valley: 0, city: 0 };
    });
    expect(getScores(s)[0]?.vp).toBe(18);
  });

  it('Жетон первенства не теряется при потере влияния, отметки считаются по позиции', () => {
    const s = edit(newGame(), (d) => {
      d.players[0]!.influence = { forest: 2, valley: 0, city: 0 };
      d.firstToMax = { forest: 0 };
    });
    expect(getScores(s)[0]).toMatchObject({ influenceVp: 0, firstVp: 1, vp: 1 });
  });

  it('Тай-брейк: Цитадель Города у одного из равных даёт ему первое место', () => {
    const s = edit(newGame(), (d) => {
      d.players[0]!.prestige = 5;
      d.players[1]!.prestige = 5;
      d.players[2]!.prestige = 5;
      d.buildings.push({ type: 'citadel', owner: 2, region: 'city', plot: null });
    });
    expect(getScores(s).map((x) => x.rank)).toEqual([2, 2, 1]);
  });

  it('Тай-брейк: при равных ПО и престиже без Цитадели Города — ничья', () => {
    const s = edit(newGame(), (d) => {
      d.players[0]!.prestige = 5;
      d.players[1]!.prestige = 5;
      d.players[2]!.prestige = 0;
    });
    expect(getScores(s).map((x) => x.rank)).toEqual([1, 1, 3]);
  });
});
