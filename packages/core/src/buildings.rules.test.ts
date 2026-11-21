/** Этап 4: здания, участки, Цитадели, престиж, подсчёт (rules.md, «Здания и участки», «Конец игры»). */
import type { BuildingId, RegionId } from '@vampire/data';
import { describe, expect, it } from 'vitest';
import { getLegalActions } from './engine';
import { getScores } from './scores';
import type { Action, BuildChoice, GameEvent, GameState, Position } from './types';
import {
  act,
  choose,
  edit,
  moveWorker,
  newGame,
  place,
  res,
  setResources,
  setWorker,
  turnTo,
} from './testing';

const start = (r: Parameters<typeof setResources>[2] = {}) =>
  setResources(turnTo(newGame(), 0), 0, r);

const buildChoices = (s: GameState): BuildChoice[] =>
  getLegalActions(s).flatMap((a) => (a.type === 'build' && a.choice ? [a.choice] : []));

const build = (s: GameState, choice: BuildChoice, log?: GameEvent[]) =>
  act(s, { type: 'build', choice }, log);

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

/** Дать игроку 0 право стройки Канцелярии прямо сейчас (дальше — его ход размещения). */
const withChanceryRight = (s: GameState) =>
  edit(s, (d) => {
    d.pending = { kind: 'build', player: 0, source: { kind: 'chancery' } };
    d.tasks.unshift({ t: 'placementTurn', first: true });
  });

const at = (location: Extract<Position, { kind: 'slot' }>['location'], slot: 1 | 2 = 1) =>
  ({ kind: 'slot', location, slot }) as const;

describe('Право стройки Канцелярии', () => {
  it('Первый слот (Б): 2 компромата → право стройки в любом регионе на любом свободном участке', () => {
    let s = place(start({ gold: 3, compromat: 2 }), 'chancery', 1);
    s = choose(s, { kind: 'buildRight' });
    expect(res(s, 0).compromat).toBe(0);
    expect(s.pending).toEqual({ kind: 'build', player: 0, source: { kind: 'chancery' } });
    const choices = buildChoices(s);
    // После входа (1) золота 2: только Склеп, на одиночных участках трёх регионов (3 + 3 + 2).
    expect(choices.every((c) => c.building === 'crypt')).toBe(true);
    expect(new Set(choices.map((c) => c.region))).toEqual(new Set(['forest', 'valley', 'city']));
    expect(choices).toHaveLength(8);
    s = build(s, { building: 'crypt', region: 'valley', plot: 'valley-mass' });
    expect(s.buildings).toEqual([
      { type: 'crypt', owner: 0, region: 'valley', plot: 'valley-mass' },
    ]);
    expect(res(s, 0).gold).toBe(0);
    expect(s.players[0]?.prestige).toBe(1);
  });

  it('Второй слот: 3 компромата → право стройки', () => {
    let s = place(start({ gold: 6, compromat: 3 }), 'chancery', 2);
    expect(getLegalActions(s)).toContainEqual({
      type: 'locationAction',
      choice: { kind: 'buildRight' },
    });
    s = choose(s, { kind: 'buildRight' });
    expect(res(s, 0).compromat).toBe(0);
    expect(s.pending?.kind).toBe('build');
  });

  it('От права можно отказаться', () => {
    let s = place(start({ gold: 6, compromat: 2 }), 'chancery', 1);
    s = choose(s, { kind: 'buildRight' });
    s = act(s, { type: 'build', choice: null });
    expect(s.buildings).toEqual([]);
    expect(s.pending?.kind).toBe('placement');
  });

  it('OQ-29 (автор): право стройки не предлагается, если строить не на что; с переключателем — сгорает', () => {
    const s = place(start({ gold: 1, compromat: 2 }), 'chancery', 1);
    expect(getLegalActions(s)).not.toContainEqual({
      type: 'locationAction',
      choice: { kind: 'buildRight' },
    });
    let t = setResources(turnTo(newGame({ rules: { buildRightWithoutOptions: true } }), 0), 0, {
      gold: 1,
      compromat: 2,
    });
    t = choose(place(t, 'chancery', 1), { kind: 'buildRight' });
    expect(t.pending?.kind).toBe('placement');
    expect(res(t, 0).compromat).toBe(0);
  });
});

describe('Участки и ограничения', () => {
  it('Двойной участок: доплата +2 золота в Лесу и Долине, +1 руда в Городе', () => {
    let s = place(start({ gold: 20, ore: 5, compromat: 2 }), 'chancery', 1);
    s = choose(s, { kind: 'buildRight' });
    s = build(s, { building: 'crypt', region: 'forest', plot: 'forest-mine-lair' });
    expect(res(s, 0)).toMatchObject({ gold: 20 - 1 - 2 - 2, ore: 5 });
    s = withChanceryRight(turnTo(s, 0));
    const before = res(s, 0);
    s = build(s, { building: 'crypt', region: 'city', plot: 'city-underground-chancery' });
    expect(res(s, 0)).toMatchObject({ gold: before.gold - 2, ore: before.ore - 1 });
  });

  it('Занятый участок не предлагается', () => {
    let s = withBuilding(start({ gold: 10, compromat: 2 }), 'abbey', 1, 'forest', 'forest-mine');
    s = choose(place(s, 'chancery', 1), { kind: 'buildRight' });
    expect(buildChoices(s).some((c) => c.plot === 'forest-mine')).toBe(false);
  });

  it('Престиж по номеру здания типа: Склеп 1 → 3 → 8; четвёртый Склеп не предлагается', () => {
    let s = start({ gold: 30, compromat: 2 });
    const log: GameEvent[] = [];
    const plots = ['forest-mine', 'forest-lair', 'valley-mass'];
    for (const plot of plots) {
      s = withChanceryRight(s);
      const region = plot.split('-')[0] as RegionId;
      s = build(s, { building: 'crypt', region, plot }, log);
    }
    expect(s.players[0]?.prestige).toBe(1 + 3 + 8);
    s = withChanceryRight(s);
    expect(buildChoices(s).some((c) => c.building === 'crypt')).toBe(false);
  });

  it('Престиж разных типов: Аббатство 4, Лавка 5 → 2', () => {
    let s = start({ gold: 30, ore: 5 });
    const builds: BuildChoice[] = [
      { building: 'abbey', region: 'forest', plot: 'forest-mine' },
      { building: 'shop', region: 'forest', plot: 'forest-lair' },
      { building: 'shop', region: 'valley', plot: 'valley-mass' },
    ];
    for (const b of builds) {
      s = withChanceryRight(s);
      s = build(s, b);
    }
    expect(s.players[0]?.prestige).toBe(4 + 5 + 2);
    expect(res(s, 0)).toMatchObject({ gold: 30 - 4 - 3 - 3, ore: 5 - 2 });
  });
});

describe('Цитадель', () => {
  const chanceryRight = (r: Parameters<typeof setResources>[2]) => withChanceryRight(start(r));

  it('Нужно влияние строящего: 4 в Лесу и Долине, 6 в Городе', () => {
    let s = chanceryRight({ gold: 7, ore: 3 });
    expect(buildChoices(s).some((c) => c.building === 'citadel')).toBe(false);
    s = edit(s, (d) => {
      d.players[0]!.influence = { forest: 4, valley: 3, city: 5 };
    });
    expect(buildChoices(s).filter((c) => c.building === 'citadel')).toEqual([
      { building: 'citadel', region: 'forest', plot: null },
    ]);
    s = edit(s, (d) => {
      d.players[0]!.influence.city = 6;
    });
    expect(buildChoices(s).filter((c) => c.building === 'citadel')).toHaveLength(2);
  });

  it('Стоит 7 золота + 3 руды, ставится на звезду, +10 престижа', () => {
    let s = chanceryRight({ gold: 7, ore: 3 });
    s = edit(s, (d) => {
      d.players[0]!.influence.forest = 4;
    });
    s = build(s, { building: 'citadel', region: 'forest', plot: null });
    expect(res(s, 0)).toMatchObject({ gold: 0, ore: 0 });
    expect(s.players[0]?.prestige).toBe(10);
    expect(s.buildings).toEqual([{ type: 'citadel', owner: 0, region: 'forest', plot: null }]);
  });

  it('Одна Цитадель на регион на всех игроков', () => {
    let s = withBuilding(chanceryRight({ gold: 7, ore: 3 }), 'citadel', 1, 'forest', null);
    s = edit(s, (d) => {
      d.players[0]!.influence.forest = 6;
    });
    expect(buildChoices(s).some((c) => c.building === 'citadel')).toBe(false);
  });

  it('Цитадель Долины: содержание каждого персонажа на 1 кровь дешевле, не ниже 0', () => {
    let s = withBuilding(newGame(), 'citadel', 0, 'valley', null);
    s = setWorker(s, 'p0w0', { profession: 'guard', character: 'officer' }); // содержание 2
    s = setWorker(s, 'p0w1', { profession: 'spy', character: 'bloodsucker' }); // содержание 0
    s = setResources(s, 0, { blood: 5 });
    while (s.round === 1 && s.pending) {
      s = act(
        s,
        s.pending.kind === 'placement' ? { type: 'pass' } : (getLegalActions(s)[0] as Action),
      );
    }
    expect(res(s, 0).blood).toBe(5 - 1);
  });

  it('Цитадель Города: компромат владельцу, когда чужой рабочий приходит в Город', () => {
    let s = withBuilding(start({ gold: 5 }), 'citadel', 1, 'city', null);
    s = place(s, 'cityHall', 1);
    expect(res(s, 1).compromat).toBe(1);
    s = place(turnTo(s, 1), 'chancery', 2);
    expect(res(s, 1).compromat).toBe(1); // свой рабочий — нет
  });
});

describe('Награда за бой: право стройки', () => {
  /** p0 побеждает в Лесу (Шпион). */
  const winForest = (gold: number) => {
    let s = newGame();
    s = setWorker(s, 'p0w0', { profession: 'spy' });
    s = moveWorker(s, 'p0w0', at('mine'));
    s = moveWorker(s, 'p1w0', at('witchCircle'));
    s = setResources(s, 0, { gold });
    while (s.pending && s.pending.kind !== 'combatReward') {
      s = act(
        s,
        s.pending.kind === 'placement' ? { type: 'pass' } : (getLegalActions(s)[0] as Action),
      );
    }
    return s;
  };

  it('Вместо +1 влияния — постройка сразу в этом регионе по полной цене', () => {
    let s = winForest(4);
    expect(getLegalActions(s)).toEqual([
      { type: 'combatReward', choice: 'influence' },
      { type: 'combatReward', choice: 'build' },
    ]);
    s = act(s, { type: 'combatReward', choice: 'build' });
    expect(s.pending).toEqual({
      kind: 'build',
      player: 0,
      source: { kind: 'reward', region: 'forest' },
    });
    expect(buildChoices(s).every((c) => c.region === 'forest')).toBe(true);
    s = build(s, { building: 'abbey', region: 'forest', plot: 'forest-lair' });
    expect(s.players[0]?.influence.forest).toBe(1);
  });

  it('Если строить не на что, стройку не предлагают', () => {
    const s = winForest(0);
    // Награда из одного варианта принимается сама — до награды дело не доходит.
    expect(s.pending?.kind).not.toBe('combatReward');
  });
});

describe('Архитектор (Профессии)', () => {
  it('При размещении может построить на свободном участке рядом со своей локацией', () => {
    let s = setWorker(start({ gold: 10 }), 'p0w0', { profession: 'architect' });
    s = place(s, 'lair', 2, { workerId: 'p0w0' });
    expect(s.pending).toEqual({
      kind: 'build',
      player: 0,
      source: { kind: 'architect', workerId: 'p0w0' },
    });
    expect(new Set(buildChoices(s).map((c) => c.plot))).toEqual(
      new Set(['forest-lair', 'forest-mine-lair']),
    );
  });

  it('Строит после действия локации (персонаж → локация → профессия)', () => {
    let s = setWorker(start({ gold: 0 }), 'p0w0', { profession: 'architect' });
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    // 3 золота с Рудника уже получены — хватает на Склеп.
    expect(buildChoices(s)).toContainEqual({
      building: 'crypt',
      region: 'forest',
      plot: 'forest-mine',
    });
  });

  it('Может построить Цитадель своего региона (ответ автора)', () => {
    let s = setWorker(start({ gold: 7, ore: 3 }), 'p0w0', { profession: 'architect' });
    s = edit(s, (d) => {
      d.players[0]!.influence.forest = 4;
    });
    s = place(s, 'lair', 2, { workerId: 'p0w0' });
    expect(buildChoices(s)).toContainEqual({ building: 'citadel', region: 'forest', plot: null });
  });

  it('Нечего строить — ход идёт дальше без решения', () => {
    let s = setWorker(start({ gold: 0 }), 'p0w0', { profession: 'architect' });
    s = place(s, 'lair', 2, { workerId: 'p0w0' });
    expect(s.pending?.kind).toBe('placement');
  });
});

describe('Аббатство и Лавка', () => {
  it('Аббатство: +2 крови владельцу при каждом вытеснении из соседней локации', () => {
    let s = withBuilding(newGame(), 'abbey', 2, 'forest', 'forest-mine');
    s = moveWorker(s, 'p1w0', at('mine'));
    s = edit(turnTo(s, 0), (d) => {
      d.locations.mine.professionToken = 'guard';
    });
    s = setWorker(s, 'p0w0', { profession: 'guard' });
    s = place(s, 'mine', 2, { workerId: 'p0w0', displace: true });
    expect(res(s, 2).blood).toBe(2);
  });

  it('Аббатство срабатывает и на вытеснение Палачом', () => {
    let s = withBuilding(newGame(), 'abbey', 2, 'forest', 'forest-witchCircle');
    s = moveWorker(s, 'p1w0', at('witchCircle'));
    s = setWorker(turnTo(s, 0), 'p0w0', { profession: 'executioner' });
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    s = act(s, { type: 'executioner', target: 'p1w0' });
    expect(res(s, 2).blood).toBe(2);
  });

  it('Лавка: +1 золото владельцу, когда чужой рабочий приходит в соседнюю локацию', () => {
    let s = withBuilding(start(), 'shop', 1, 'forest', 'forest-mine-lair');
    s = place(s, 'lair', 2);
    expect(res(s, 1).gold).toBe(2 + 1);
    s = place(turnTo(s, 1), 'mine', 1);
    expect(res(s, 1).gold).toBe(2 + 1 + 3); // свой рабочий — без дохода Лавки
  });

  it('Копирование через Подполье не считается посещением (Лавка не платит)', () => {
    let s = withBuilding(start({ gold: 5 }), 'shop', 1, 'forest', 'forest-mine');
    s = place(s, 'underground', 1);
    s = choose(s, { kind: 'copy', location: 'mine', slot: 1 });
    expect(res(s, 1).gold).toBe(2);
  });
});

describe('Конец игры и подсчёт', () => {
  it('ПО = отметки престижа + отметки влияния + жетоны первенства', () => {
    const s = edit(newGame(), (d) => {
      d.players[0]!.prestige = 10; // отметки 3, 6, 10
      d.players[0]!.influence = { forest: 6, valley: 3, city: 5 }; // 2 + 1 + 2
      d.firstToMax.forest = 0;
    });
    expect(getScores(s)[0]).toMatchObject({
      vp: 3 + 5 + 1,
      prestigeVp: 3,
      influenceVp: 5,
      firstVp: 1,
      rank: 1,
    });
  });

  it('Тай-брейк: ПО → престиж → владелец Цитадели Города; иначе ничья', () => {
    let s = edit(newGame(), (d) => {
      d.players[0]!.prestige = 4;
      d.players[1]!.prestige = 5;
      d.players[2]!.prestige = 3;
    });
    // У всех по 1 ПО (отметка 3); престиж решает.
    expect(getScores(s).map((x) => x.rank)).toEqual([2, 1, 3]);
    s = edit(s, (d) => {
      d.players[0]!.prestige = 5;
    });
    expect(getScores(s).map((x) => x.rank)).toEqual([1, 1, 3]);
    s = withBuilding(s, 'citadel', 0, 'city', null);
    expect(getScores(s).map((x) => x.rank)).toEqual([1, 2, 3]);
  });

  it('В конце игры +престиж за сохранённых персонажей (1–4 по содержанию)', () => {
    let s = edit(newGame(), (d) => {
      d.round = d.config.rounds;
    });
    s = setWorker(s, 'p0w0', { profession: 'guard', character: 'officer' }); // содержание 2 → 3
    s = setWorker(s, 'p0w1', { profession: 'spy', character: 'bloodsucker' }); // 0 → 1
    s = setResources(s, 0, { blood: 5 });
    while (s.pending) {
      s = act(
        s,
        s.pending.kind === 'placement' ? { type: 'pass' } : (getLegalActions(s)[0] as Action),
      );
    }
    expect(s.phase).toBe('gameOver');
    expect(s.players[0]?.prestige).toBe(3 + 1);
  });

  it('Неоплаченный персонаж в 6-м раунде престижа не даёт', () => {
    let s = edit(newGame(), (d) => {
      d.round = d.config.rounds;
    });
    s = setWorker(s, 'p0w0', { profession: 'guard', character: 'officer' });
    s = setResources(s, 0, { blood: 0 });
    while (s.pending) {
      s = act(
        s,
        s.pending.kind === 'placement' ? { type: 'pass' } : (getLegalActions(s)[0] as Action),
      );
    }
    expect(s.players[0]?.prestige).toBe(0);
  });
});

describe('Крайние случаи стройки и подсчёта', () => {
  it('Тай-брейк троих: полная ничья без Цитадели Города — все первые; с Цитаделью у одного — [1, 2, 2]', () => {
    let s = edit(newGame(), (d) => {
      for (const p of d.players) p.prestige = 4;
    });
    expect(getScores(s).map((x) => x.rank)).toEqual([1, 1, 1]);
    s = withBuilding(s, 'citadel', 1, 'city', null);
    expect(getScores(s).map((x) => x.rank)).toEqual([2, 1, 2]);
  });

  it('Престиж не выше 40; на полном треке событие не создаётся', () => {
    let s = withChanceryRight(start({ gold: 10 }));
    s = edit(s, (d) => {
      d.players[0]!.prestige = 38;
      d.buildings.push(
        { type: 'crypt', owner: 0, region: 'forest', plot: 'forest-mine' },
        { type: 'crypt', owner: 0, region: 'forest', plot: 'forest-lair' },
      );
    });
    const log: GameEvent[] = [];
    s = build(s, { building: 'crypt', region: 'valley', plot: 'valley-mass' }, log);
    expect(s.players[0]?.prestige).toBe(40);
    expect(log).toContainEqual({
      type: 'prestigeChanged',
      player: 0,
      from: 38,
      to: 40,
      reason: 'building',
    });
    s = withChanceryRight(turnTo(s, 0));
    const log2: GameEvent[] = [];
    s = build(s, { building: 'abbey', region: 'valley', plot: 'valley-market' }, log2);
    expect(log2.some((e) => e.type === 'prestigeChanged')).toBe(false);
  });

  it('Архитектор, вытесненный до постройки (Палачом в той же цепочке нельзя) — строить нечего', () => {
    // Архитектора нет на поле: источник стройки пуст.
    let s = setWorker(start({ gold: 10 }), 'p0w0', { profession: 'architect' });
    s = edit(s, (d) => {
      d.pending = { kind: 'build', player: 0, source: { kind: 'architect', workerId: 'p0w0' } };
      d.tasks.unshift({ t: 'placementTurn', first: true });
    });
    expect(buildChoices(s)).toEqual([]);
  });

  it('Две постройки подряд: занятый первой участок второй не предлагается', () => {
    let s = setWorker(start({ gold: 10, ore: 1, compromat: 2 }), 'p0w0', {
      profession: 'architect',
    });
    s = place(s, 'chancery', 1, { workerId: 'p0w0' });
    s = choose(s, { kind: 'buildRight' });
    s = build(s, { building: 'crypt', region: 'city', plot: 'city-chancery' });
    // Затем Архитектор: участок у Канцелярии уже занят.
    expect(s.pending).toMatchObject({ kind: 'build', source: { kind: 'architect' } });
    expect(buildChoices(s).some((c) => c.plot === 'city-chancery')).toBe(false);
    expect(buildChoices(s).some((c) => c.plot === 'city-underground-chancery')).toBe(true);
  });

  it('Цитадель через награду за бой: при влиянии 4 и 7 золота + 3 руды', () => {
    let s = newGame();
    s = setWorker(s, 'p0w0', { profession: 'spy' });
    s = moveWorker(s, 'p0w0', at('mine'));
    s = setResources(s, 0, { gold: 7, ore: 3 });
    s = edit(s, (d) => {
      d.players[0]!.influence.forest = 3; // +1 за победу → 4
    });
    while (s.pending && s.pending.kind !== 'combatReward') {
      s = act(
        s,
        s.pending.kind === 'placement' ? { type: 'pass' } : (getLegalActions(s)[0] as Action),
      );
    }
    s = act(s, { type: 'combatReward', choice: 'build' });
    expect(buildChoices(s)).toContainEqual({ building: 'citadel', region: 'forest', plot: null });
  });
});
