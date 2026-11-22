/** Тесты-сценарии аудита этапа 1: закрывают пробелы относительно docs/rules.md и ответов автора. */
import {
  BUILDINGS,
  CITY_ENTRY,
  COMBAT_TOKENS,
  LOCATIONS,
  PLOTS,
  PRESTIGE_TRACK,
  TRACKS,
  UPKEEP_TIERS,
  type LocationId,
} from '@vampire/data';
import { describe, expect, it } from 'vitest';
import { cityEntryCost } from './economy';
import type { GameEvent, GameState, Position } from './types';
import {
  choose,
  edit,
  locationOptions,
  moveWorker,
  newGame,
  passAll,
  place,
  placeActions,
  res,
  setResources,
  setWorker,
  turnTo,
} from './testing';

const slot1 = (location: LocationId): Position => ({ kind: 'slot', location, slot: 1 });
const slot2 = (location: LocationId): Position => ({ kind: 'slot', location, slot: 2 });

type Player = GameState['players'][number];
const player = (s: GameState, i: number) => s.players[i] as Player;

function forestCombat(log: GameEvent[]) {
  return log.flatMap((e) => (e.type === 'combatResolved' && e.region === 'forest' ? [e] : []))[0];
}

describe('Данные: числа таблиц против rules.md и изображений', () => {
  it('Локации: действия первых и вторых слотов', () => {
    const slots = (id: LocationId) => LOCATIONS[id].slots;
    expect(slots('mine')).toEqual([
      { kind: 'gain', gain: { gold: 3 } },
      { kind: 'gain', gain: { gold: 2 } },
    ]);
    expect(slots('witchCircle')).toEqual([
      { kind: 'gain', gain: { blood: 3 } },
      { kind: 'gain', gain: { blood: 2 } },
    ]);
    expect(slots('lair')).toEqual([
      { kind: 'gain', gain: { ore: 1 } },
      { kind: 'lairStash', bloodPerOre: 4, maxExchanges: 1 },
    ]);
    expect(slots('mass')).toEqual([
      { kind: 'mass', unit: 1, rate: 3, maxTimes: 2 },
      { kind: 'mass', unit: 1, rate: 2, maxTimes: 2 },
    ]);
    expect(slots('market')).toEqual([
      { kind: 'market', ore: 1, buyCost: 2, sellGain: 4 },
      { kind: 'market', ore: 1, buyCost: 3, sellGain: 3 },
    ]);
    expect(slots('tavern')[1]).toEqual({ kind: 'gain', gain: { gold: 1, blood: 1 } });
    expect(slots('chancery')).toEqual([
      { kind: 'chancery', maxTimes: 2, conversionCost: 1, goldBlood: 2, ore: 1, buildRightCost: 2 },
      { kind: 'chanceryBuild', compromatCost: 3 },
    ]);
    expect(slots('underground')).toEqual([
      { kind: 'copy', goldCost: 1, scope: ['forest', 'valley', 'city'] },
      { kind: 'copy', goldCost: 1, scope: ['forest', 'valley'] },
    ]);
    expect(slots('commissariat')[1]).toEqual({ kind: 'revive', oreCost: 2 });
    expect(slots('cityHall')).toEqual([
      {
        kind: 'cityHall',
        offers: [
          { ore: 1, influence: 1 },
          { ore: 3, influence: 2 },
        ],
      },
      {
        kind: 'cityHall',
        offers: [
          { ore: 2, influence: 1 },
          { ore: 4, influence: 2 },
        ],
      },
    ]);
  });

  it('Треки влияния, вход в Город, трек престижа', () => {
    expect(TRACKS.forest).toMatchObject({
      max: 6,
      vpMarks: [3, 6],
      citadelAt: 4,
      cityEntryRaiseAt: 5,
    });
    expect(TRACKS.valley).toMatchObject({
      max: 6,
      vpMarks: [3, 6],
      citadelAt: 4,
      cityEntryRaiseAt: 5,
    });
    expect(TRACKS.city).toMatchObject({
      max: 8,
      vpMarks: [3, 5, 8],
      citadelAt: 6,
      cityEntryRaiseAt: null,
    });
    expect(CITY_ENTRY).toEqual({ base: 1, raiseStep: 1, max: 3 });
    expect(PRESTIGE_TRACK.max).toBe(40);
    expect(PRESTIGE_TRACK.vpMarks).toEqual([3, 6, 10, 15, 20, 26, 33, 40]);
  });

  it('Участки: соседи и доплаты (Лес/Долина +2 золота, Город +1 руда у двойных)', () => {
    const doubles = PLOTS.filter((p) => p.adjacent.length === 2).map((p) => ({
      region: p.region,
      adjacent: [...p.adjacent].sort(),
      surcharge: p.surcharge,
    }));
    const sorted = (...a: LocationId[]) => a.sort();
    expect(doubles).toEqual([
      { region: 'forest', adjacent: sorted('mine', 'lair'), surcharge: { gold: 2 } },
      { region: 'forest', adjacent: sorted('mine', 'witchCircle'), surcharge: { gold: 2 } },
      { region: 'valley', adjacent: sorted('market', 'tavern'), surcharge: { gold: 2 } },
      { region: 'valley', adjacent: sorted('mass', 'tavern'), surcharge: { gold: 2 } },
      { region: 'city', adjacent: sorted('underground', 'chancery'), surcharge: { ore: 1 } },
      { region: 'city', adjacent: sorted('underground', 'commissariat'), surcharge: { ore: 1 } },
      { region: 'city', adjacent: sorted('commissariat', 'cityHall'), surcharge: { ore: 1 } },
    ]);
    const singles = PLOTS.filter((p) => p.adjacent.length === 1).map((p) => p.adjacent[0]);
    expect([...singles].sort()).toEqual(
      ['mine', 'witchCircle', 'lair', 'market', 'mass', 'tavern', 'chancery', 'cityHall'].sort(),
    );
  });

  it('Здания, жетоны боя, содержание', () => {
    expect(BUILDINGS.crypt).toMatchObject({ cost: { gold: 2 }, prestige: [1, 3, 8] });
    expect(BUILDINGS.abbey).toMatchObject({ cost: { gold: 4 }, prestige: [4, 4, 4] });
    expect(BUILDINGS.shop).toMatchObject({ cost: { gold: 3, ore: 1 }, prestige: [5, 2, 5] });
    expect(BUILDINGS.citadel).toMatchObject({ cost: { gold: 7, ore: 3 }, prestige: [10] });
    const strength = (id: keyof typeof COMBAT_TOKENS) => COMBAT_TOKENS[id].strength;
    expect([strength('attack'), strength('massacre'), strength('defense')]).toEqual([1, 2, 1]);
    expect(COMBAT_TOKENS.decoy.count).toBe(5);
    expect(UPKEEP_TIERS.map((t) => [t.upkeep, t.endPrestige])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
  });
});

describe('Параметры партии: 2–4 игрока', () => {
  it('Для 2, 3 и 4 игроков: по 3 рабочих, 2 золота, нулевое влияние', () => {
    for (const n of [2, 3, 4]) {
      const s = newGame({ playerCount: n });
      expect(s.workers).toHaveLength(3 * n);
      for (const p of s.players) {
        expect(p.resources).toEqual({ gold: 2, blood: 0, ore: 0, compromat: 0 });
        expect(p.influence).toEqual({ forest: 0, valley: 0, city: 0 });
      }
    }
  });

  it('Число игроков вне 2–4 отвергается', () => {
    expect(() => newGame({ playerCount: 1 })).toThrow();
    expect(() => newGame({ playerCount: 5 })).toThrow();
  });
});

describe('Вход в Город: плата при вытеснении и после подорожания', () => {
  const displaceInCity = (profession: 'spy' | 'aristocrat') => {
    let s = turnTo(newGame(), 0);
    s = edit(s, (d) => {
      d.locations.chancery.professionToken = profession;
    });
    s = place(s, 'chancery', 1, { workerId: 'p0w0' });
    expect(s.pending).toMatchObject({ kind: 'placement', player: 1 });
    s = setWorker(s, 'p1w0', { profession });
    const log: GameEvent[] = [];
    s = place(s, 'chancery', 2, { displace: true, log });
    return { s, log };
  };

  it('Вход в Город: вытесняющий в Город платит вход, как и при обычном размещении', () => {
    const { s, log } = displaceInCity('spy');
    expect(log).toContainEqual({ type: 'cityEntryPaid', player: 1, cost: 1, resource: 'gold' });
    expect(res(s, 1).gold).toBe(1);
  });

  it('Вход в Город: Аристократ входит бесплатно и при вытеснении', () => {
    const { s, log } = displaceInCity('aristocrat');
    expect(log.some((e) => e.type === 'cityEntryPaid')).toBe(false);
    expect(res(s, 1).gold).toBe(2);
  });

  it('Вход в Город: после подорожания списывается текущая цена (2, затем 3)', () => {
    let s = edit(turnTo(newGame(), 0), (d) => {
      d.cityEntryRaisedRegions = ['forest'];
    });
    s = setResources(s, 0, { gold: 5 });
    expect(cityEntryCost(s)).toBe(2);
    expect(res(place(s, 'chancery', 1), 0).gold).toBe(3);

    s = edit(s, (d) => {
      d.cityEntryRaisedRegions = ['forest', 'valley'];
    });
    expect(res(place(s, 'chancery', 1), 0).gold).toBe(2);
    // Двух золотых на вход за 3 не хватает.
    s = setResources(s, 0, { gold: 2 });
    expect(placeActions(s).some((a) => LOCATIONS[a.location].region === 'city')).toBe(false);
  });

  it('Вход в Город: 5 влияния, набранные наградой за бой, тоже поднимают цену', () => {
    let s = edit(newGame(), (d) => {
      d.players[0]!.influence.forest = 3;
    });
    s = moveWorker(s, 'p0w0', slot1('mine'));
    s = passAll(s);
    expect(player(s, 0).influence.forest).toBe(5);
    expect(s.cityEntryRaisedRegions).toEqual(['forest']);
    expect(cityEntryCost(s)).toBe(2);
  });
});

describe('Бой: ничьи и состав участников', () => {
  it('При равной силе побеждает тот, у кого больше рабочих: двое обычных против Шпиона (2)', () => {
    let s = newGame();
    s = moveWorker(s, 'p0w0', slot1('mine'));
    s = moveWorker(s, 'p0w1', slot1('witchCircle'));
    s = moveWorker(s, 'p1w0', slot1('lair'));
    s = setWorker(s, 'p1w0', { profession: 'spy' });
    const log: GameEvent[] = [];
    passAll(s, log);
    const f = forestCombat(log);
    expect(f?.strengths).toEqual([
      { player: 0, strength: 2, workers: 2 },
      { player: 1, strength: 2, workers: 1 },
    ]);
    expect(f?.winner).toBe(0);
  });

  it('Ответ автора по OQ-3: в счёт «больше рабочих» идут только рабочие первых слотов; второй слот ничьей не решает', () => {
    let s = newGame();
    s = moveWorker(s, 'p0w0', slot1('mine'));
    s = moveWorker(s, 'p0w1', slot2('witchCircle'));
    s = moveWorker(s, 'p1w0', slot1('lair'));
    const log: GameEvent[] = [];
    passAll(s, log);
    const f = forestCombat(log);
    expect(f?.strengths).toEqual([
      { player: 0, strength: 1, workers: 1 },
      { player: 1, strength: 1, workers: 1 },
    ]);
    expect(f?.winner).toBeNull();
  });

  it('Вытеснение: вытеснивший считается в бою из первого слота, вытесненный — нет (он в госпитале)', () => {
    let s = turnTo(newGame(), 0);
    s = edit(s, (d) => {
      d.locations.mine.professionToken = 'spy';
    });
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    s = setWorker(s, 'p1w0', { profession: 'spy' });
    s = place(s, 'mine', 2, { displace: true });
    expect(s.workers.filter((w) => w.owner === 0 && w.position.kind === 'hospital')).toHaveLength(
      1,
    );
    expect(s.workers.filter((w) => w.owner === 0 && w.position.kind === 'reserve')).toHaveLength(2);
    const log: GameEvent[] = [];
    passAll(s, log);
    const f = forestCombat(log);
    expect(f?.strengths).toEqual([{ player: 1, strength: 2, workers: 1 }]);
    expect(f?.winner).toBe(1);
  });

  it('Награда за бой: влияние не выше максимума, первенство фиксируется при достижении 6', () => {
    let s = edit(newGame(), (d) => {
      d.players[0]!.influence.forest = 5;
    });
    s = moveWorker(s, 'p0w0', slot1('mine'));
    s = passAll(s);
    expect(player(s, 0).influence.forest).toBe(6);
    expect(s.firstToMax.forest).toBe(0);
  });
});

describe('Конец раунда и раунды', () => {
  it('Логово: копилка накапливается по 1 руде за каждый раунд без посещений', () => {
    let s = newGame();
    s = passAll(s);
    expect(s.lair.stash).toBe(1);
    s = passAll(s);
    expect(s.lair.stash).toBe(2);
  });

  it('Первый игрок переходит по часовой стрелке при 2 и 4 игроках и возвращается через n раундов', () => {
    for (const n of [2, 4]) {
      let s = newGame({ playerCount: n }, 5);
      const first = s.firstPlayer;
      for (let i = 1; i <= n; i++) {
        s = passAll(s);
        expect(s.firstPlayer).toBe((first + i) % n);
      }
      expect(s.firstPlayer).toBe(first);
    }
  });
});

describe('Локации: граничные случаи', () => {
  it('Месса: одно направление и не больше, чем есть ресурса (1 золото — только 1 раз)', () => {
    let s = setResources(turnTo(newGame(), 0), 0, { gold: 1, blood: 0 });
    s = place(s, 'mass', 1);
    expect(locationOptions(s).filter((o) => o.kind === 'mass')).toEqual([
      { kind: 'mass', from: 'gold', times: 1 },
    ]);
  });

  it('Рынок: при нехватке ресурсов обмен недоступен — только пропуск', () => {
    let s = setResources(turnTo(newGame(), 0), 0, { gold: 1, blood: 0, ore: 0 });
    s = place(s, 'market', 1);
    // Единственный вариант (пропуск) принимается автоматически.
    expect(s.pending?.kind).toBe('placement');
    expect(res(s, 0)).toMatchObject({ gold: 1, blood: 0, ore: 0 });
  });

  it('Подполье копирует второй слот Комиссариата: рабочий возвращается из госпиталя за 2 руды', () => {
    let s = setResources(turnTo(newGame(), 0), 0, { gold: 3, ore: 2 });
    s = moveWorker(s, 'p0w1', { kind: 'hospital' });
    s = place(s, 'underground', 1, { workerId: 'p0w0' });
    s = choose(s, { kind: 'copy', location: 'commissariat', slot: 2 });
    expect(locationOptions(s)).toContainEqual({ kind: 'revive', workerId: 'p0w1' });
    s = choose(s, { kind: 'revive', workerId: 'p0w1' });
    expect(res(s, 0)).toMatchObject({ gold: 1, ore: 0 });
    expect(s.workers.find((w) => w.id === 'p0w1')?.position).toEqual({ kind: 'reserve' });
  });

  it('OQ-5: Ратуша разрешает платить руду за влияние в регионе, где трек уже на максимуме', () => {
    let s = edit(turnTo(newGame(), 0), (d) => {
      d.players[0]!.influence.forest = 6;
    });
    s = setResources(s, 0, { ore: 1 });
    s = place(s, 'cityHall', 1);
    expect(locationOptions(s)).toContainEqual({ kind: 'cityHall', offer: 0, region: 'forest' });
  });

  it('OQ-6: Подполье позволяет скопировать действие, которое после оплаты копирования невыполнимо', () => {
    let s = turnTo(newGame(), 0);
    s = place(s, 'underground', 1);
    // Остался 1 золото и 0 крови: копию Мессы можно оплатить, но выполнить уже нечем.
    expect(res(s, 0).gold).toBe(1);
    expect(locationOptions(s)).toContainEqual({ kind: 'copy', location: 'mass', slot: 1 });
    s = choose(s, { kind: 'copy', location: 'mass', slot: 1 });
    // Выполнить нечем: пропуск принят автоматически, золото потрачено зря.
    expect(s.pending?.kind).toBe('placement');
    expect(res(s, 0).gold).toBe(0);
  });
});
