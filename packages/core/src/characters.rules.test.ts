/** Этап 5: эффекты персонажей — каждый со своим тестом (rules.md, «Персонажи»; ответы автора). */
import type { CharacterId, LocationId, ProfessionId } from '@vampire/data';
import { describe, expect, it } from 'vitest';
import { getLegalActions } from './engine';
import type { Action, CharacterChoice, GameEvent, GameState } from './types';
import {
  act,
  edit,
  moveWorker,
  newGame,
  place,
  placeActions,
  res,
  setResources,
  setWorker,
  turnTo,
} from './testing';

const at = (location: LocationId, slot: 1 | 2 = 1) => ({ kind: 'slot', location, slot }) as const;

/** Партия, ход игрока 0, ресурсы игроку 0. */
const start = (r: Parameters<typeof setResources>[2] = {}) =>
  setResources(turnTo(newGame(), 0), 0, r);

/** Дать рабочему персонажа (и профессию, по умолчанию Страж — без эффекта при размещении). */
const give = (
  s: GameState,
  workerId: string,
  character: CharacterId,
  profession: ProfessionId = 'guard',
) => setWorker(s, workerId, { character, profession });

const characterChoices = (s: GameState): CharacterChoice[] =>
  getLegalActions(s).flatMap((a) => (a.type === 'character' ? [a.choice] : []));

const pick = (s: GameState, choice: CharacterChoice, log?: GameEvent[]) =>
  act(s, { type: 'character', choice }, log);

const worker = (s: GameState, id: string) => s.workers.find((w) => w.id === id);

/** Доиграть размещение и бои: все пасуют, остальное — первый вариант. До содержания включительно. */
function finishRound(s: GameState, log?: GameEvent[]): GameState {
  const round = s.round;
  while (s.round === round && s.pending) {
    s = act(
      s,
      s.pending.kind === 'placement' ? { type: 'pass' } : (getLegalActions(s)[0] as Action),
      log,
    );
  }
  return s;
}

describe('Персонажи, содержание 0', () => {
  it('Падальщик: +1 кровь за каждого рабочего в госпитале', () => {
    let s = give(start(), 'p0w0', 'scavenger');
    s = moveWorker(s, 'p1w0', { kind: 'hospital' });
    s = moveWorker(s, 'p2w0', { kind: 'hospital' });
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    expect(res(s, 0).blood).toBe(2);
  });

  it('Доносчик: компромат на карту; если его вытеснят — владелец получает его сверх компенсации', () => {
    let s = give(start(), 'p0w0', 'snitch', 'aristocrat');
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    expect(s.cardStash).toEqual([
      { workerId: 'p0w0', owner: 0, character: 'snitch', amount: 1, region: 'forest' },
    ]);
    s = edit(turnTo(s, 1), (d) => {
      d.locations.mine.professionToken = 'spy';
    });
    s = give(s, 'p1w0', 'bloodsucker', 'spy');
    s = place(s, 'mine', 2, { workerId: 'p1w0', displace: true });
    expect(res(s, 0).compromat).toBe(1 + 1);
    expect(s.cardStash).toEqual([]);
  });

  it('Доносчик: не вытеснили — в конце раунда компромат уходит в банк', () => {
    let s = give(start({ blood: 5 }), 'p0w0', 'snitch');
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    s = finishRound(s);
    expect(res(s, 0).compromat).toBe(0);
    expect(s.cardStash).toEqual([]);
  });

  it('Кровосос: +1 кровь', () => {
    let s = give(start(), 'p0w0', 'bloodsucker');
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    expect(res(s, 0)).toMatchObject({ blood: 1, ore: 1 });
  });

  it('Мародёр: +2 золота за вытеснение чужого рабочего', () => {
    let s = moveWorker(start(), 'p1w0', at('mine'));
    s = edit(s, (d) => {
      d.locations.mine.professionToken = 'spy';
    });
    s = give(s, 'p0w0', 'marauder', 'spy');
    s = place(s, 'mine', 2, { workerId: 'p0w0', displace: true });
    expect(res(s, 0).gold).toBe(2 + 2 + 2); // старт + второй слот Рудника + Мародёр
  });

  it('Мародёр: за вытеснение своего рабочего ничего', () => {
    let s = moveWorker(start(), 'p0w1', at('mine'));
    s = edit(s, (d) => {
      d.locations.mine.professionToken = 'spy';
    });
    s = give(s, 'p0w0', 'marauder', 'spy');
    s = place(s, 'mine', 2, { workerId: 'p0w0', displace: true });
    expect(res(s, 0).gold).toBe(2 + 2);
  });

  it('Летописец: +2 престижа', () => {
    let s = give(start(), 'p0w0', 'chronicler');
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    expect(s.players[0]?.prestige).toBe(2);
  });
});

describe('Персонажи, содержание 1', () => {
  it('Баламут: 1 жетон силы в текущий регион', () => {
    let s = give(start(), 'p0w0', 'troublemaker');
    s = place(s, 'mass', 2, { workerId: 'p0w0' });
    expect(s.powerTokens).toEqual([{ owner: 0, region: 'valley', count: 1 }]);
  });

  it('Алхимик: в этом действии 1 руду можно заменить 1 золотом (Рынок: 1 золото → 4)', () => {
    let s = give(start({ gold: 1, ore: 0 }), 'p0w0', 'alchemist');
    s = place(s, 'market', 1, { workerId: 'p0w0' });
    expect(getLegalActions(s)).toContainEqual({
      type: 'locationAction',
      choice: { kind: 'marketSell', receive: { gold: 4, blood: 0 }, alchemy: true },
    });
    s = act(s, {
      type: 'locationAction',
      choice: { kind: 'marketSell', receive: { gold: 4, blood: 0 }, alchemy: true },
    });
    expect(res(s, 0)).toMatchObject({ gold: 4, ore: 0 });
    // Действует только в своём размещении.
    expect(s.alchemy).toBeNull();
  });

  it('Без Алхимика заменить руду нельзя', () => {
    let s = give(start({ gold: 1, ore: 0 }), 'p0w0', 'bloodsucker');
    s = place(s, 'market', 1, { workerId: 'p0w0' });
    expect(
      getLegalActions(s).some((a) => a.type === 'locationAction' && a.choice.kind === 'marketSell'),
    ).toBe(false);
  });

  it('Кладовщик: +2 золота', () => {
    let s = give(start(), 'p0w0', 'storekeeper');
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    expect(res(s, 0).gold).toBe(4);
  });

  it('Казначей: 1 компромат → 3 золота; без компромата не срабатывает', () => {
    let s = give(start({ compromat: 1 }), 'p0w0', 'treasurer');
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    expect(res(s, 0)).toMatchObject({ gold: 5, compromat: 0 });
    let t = give(start({ compromat: 0 }), 'p0w0', 'treasurer');
    t = place(t, 'lair', 1, { workerId: 'p0w0' });
    expect(res(t, 0).gold).toBe(2);
  });

  it('Оборотень: 2 жетона силы, если у соперника в регионе сила на 2+ больше', () => {
    let s = give(start(), 'p1w0', 'bloodsucker', 'spy');
    s = moveWorker(s, 'p1w0', at('witchCircle'));
    s = edit(s, (d) => {
      d.powerTokens.push({ owner: 1, region: 'forest', count: 1 });
    });
    s = give(s, 'p0w0', 'werewolf');
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    // У p1 сила 3, у p0 — 1.
    expect(s.powerTokens).toContainEqual({ owner: 0, region: 'forest', count: 2 });
  });

  it('Оборотень: разница меньше 2 — не срабатывает', () => {
    let s = moveWorker(start(), 'p1w0', at('witchCircle'));
    s = give(s, 'p0w0', 'werewolf');
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    expect(s.powerTokens).toEqual([]);
  });

  it('Информатор: +2 компромата, каждый соперник +1', () => {
    let s = give(start(), 'p0w0', 'informant');
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    expect(s.players.map((p) => p.resources.compromat)).toEqual([2, 1, 1]);
  });

  it('Манипулятор: −1 влияние здесь, +2 в другом регионе', () => {
    let s = give(start(), 'p0w0', 'manipulator');
    s = edit(s, (d) => {
      d.players[0]!.influence.forest = 1;
    });
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    expect(characterChoices(s)).toEqual([
      { kind: 'manipulator', to: 'valley' },
      { kind: 'manipulator', to: 'city' },
    ]);
    s = pick(s, { kind: 'manipulator', to: 'city' });
    expect(s.players[0]?.influence).toEqual({ forest: 0, valley: 0, city: 2 });
  });

  it('Манипулятор: при 0 влияния здесь не срабатывает', () => {
    let s = give(start(), 'p0w0', 'manipulator');
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    expect(s.pending?.kind).toBe('placement');
  });

  it('Каменщик: +1 золото за каждое своё здание в регионе (с Цитаделью), максимум 3', () => {
    let s = give(start(), 'p0w0', 'mason');
    s = edit(s, (d) => {
      d.buildings.push(
        { type: 'crypt', owner: 0, region: 'forest', plot: 'forest-mine' },
        { type: 'citadel', owner: 0, region: 'forest', plot: null },
        { type: 'abbey', owner: 1, region: 'forest', plot: 'forest-lair' },
        { type: 'crypt', owner: 0, region: 'valley', plot: 'valley-mass' },
      );
    });
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    expect(res(s, 0).gold).toBe(2 + 2);
  });

  it('Карманник: по 1 золоту у каждого соперника, чьи рабочие стоят в регионе', () => {
    let s = moveWorker(start(), 'p1w0', at('witchCircle', 2));
    s = moveWorker(s, 'p2w0', at('mass'));
    s = give(s, 'p0w0', 'pickpocket');
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    expect(s.players.map((p) => p.resources.gold)).toEqual([3, 1, 2]);
  });

  it('Ренегат: −1 влияние здесь → 1 руда или право стройки в этом регионе', () => {
    let s = give(start({ gold: 2 }), 'p0w0', 'renegade');
    s = edit(s, (d) => {
      d.players[0]!.influence.forest = 1;
    });
    s = place(s, 'witchCircle', 1, { workerId: 'p0w0' });
    expect(characterChoices(s)).toEqual([
      { kind: 'renegade', gain: 'ore' },
      { kind: 'renegade', gain: 'build' },
    ]);
    s = pick(s, { kind: 'renegade', gain: 'build' });
    expect(s.players[0]?.influence.forest).toBe(0);
    expect(s.pending).toEqual({
      kind: 'build',
      player: 0,
      source: { kind: 'renegade', region: 'forest' },
    });
    const regions = getLegalActions(s).flatMap((a) =>
      a.type === 'build' && a.choice ? [a.choice.region] : [],
    );
    expect(new Set(regions)).toEqual(new Set(['forest']));
  });

  it('Ренегат: выбор руды; при 0 влияния не срабатывает', () => {
    let s = give(start(), 'p0w0', 'renegade');
    s = edit(s, (d) => {
      d.players[0]!.influence.forest = 1;
    });
    s = place(s, 'witchCircle', 1, { workerId: 'p0w0' });
    s = pick(s, { kind: 'renegade', gain: 'ore' });
    expect(res(s, 0).ore).toBe(1);
    let t = give(start(), 'p0w0', 'renegade');
    t = place(t, 'witchCircle', 1, { workerId: 'p0w0' });
    expect(t.pending?.kind).toBe('placement');
  });
});

describe('Персонажи, содержание 2', () => {
  it('Офицер: 2 жетона силы в текущий регион', () => {
    let s = give(start(), 'p0w0', 'officer');
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    expect(s.powerTokens).toEqual([{ owner: 0, region: 'forest', count: 2 }]);
  });

  it('Безумец: эффект можно не использовать — тогда действие своей локации (автор, 23.11)', () => {
    let s = give(start(), 'p0w0', 'madman');
    const gold = res(s, 0).gold;
    s = place(s, 'mine', 2, { workerId: 'p0w0' });
    s = pick(s, { kind: 'madman', location: null });
    expect(res(s, 0).gold).toBe(gold + 2); // Рудник, второй слот
  });

  it('Безумец: вместо своей локации — первый слот другой локации региона', () => {
    let s = give(start(), 'p0w0', 'madman');
    s = place(s, 'mine', 2, { workerId: 'p0w0' });
    expect(characterChoices(s)).toEqual([
      { kind: 'madman', location: 'witchCircle' },
      { kind: 'madman', location: 'lair' },
      { kind: 'madman', location: null },
    ]);
    const log: GameEvent[] = [];
    s = pick(s, { kind: 'madman', location: 'witchCircle' }, log);
    expect(res(s, 0)).toMatchObject({ gold: 2, blood: 3 });
    expect(log).toContainEqual(
      expect.objectContaining({
        type: 'locationActionResolved',
        location: 'witchCircle',
        copy: true,
      }),
    );
  });

  it('Лазутчик: встаёт в занятый первый слот без вытеснения, оба в бою; вытеснение выбивает обоих', () => {
    let s = moveWorker(start(), 'p1w0', at('mine'));
    s = give(s, 'p0w0', 'infiltrator', 'aristocrat');
    expect(placeActions(s)).toContainEqual({
      type: 'place',
      workerId: 'p0w0',
      location: 'mine',
      slot: 1,
      displace: false,
    });
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    expect(worker(s, 'p1w0')?.position).toEqual(at('mine'));
    expect(worker(s, 'p0w0')?.position).toEqual(at('mine'));
    expect(res(s, 0).gold).toBe(5);
    s = edit(turnTo(s, 2), (d) => {
      d.locations.mine.professionToken = 'spy';
    });
    s = give(s, 'p2w0', 'bloodsucker', 'spy');
    s = place(s, 'mine', 2, { workerId: 'p2w0', displace: true });
    expect(worker(s, 'p0w0')?.position.kind).toBe('hospital');
    expect(worker(s, 'p1w0')?.position.kind).toBe('hospital');
  });

  it('Обычный рабочий в занятый первый слот не встаёт', () => {
    const s = moveWorker(give(start(), 'p0w0', 'bloodsucker'), 'p1w0', at('mine'));
    expect(placeActions(s).some((a) => a.location === 'mine' && a.slot === 1)).toBe(false);
  });

  it('Дипломат: +1 влияние в текущем регионе', () => {
    let s = give(start(), 'p0w0', 'diplomat');
    s = place(s, 'mass', 2, { workerId: 'p0w0' });
    expect(s.players[0]?.influence.valley).toBe(1);
  });

  it('Рудокоп: +1 руда', () => {
    let s = give(start(), 'p0w0', 'oreMiner');
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    expect(res(s, 0).ore).toBe(1);
  });

  it('Интриган: блокирует другую локацию для всех до начала своего следующего хода', () => {
    let s = give(start(), 'p0w0', 'intriguer');
    s = edit(s, (d) => {
      d.firstPlayer = 0;
    });
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    expect(characterChoices(s)).not.toContainEqual({ kind: 'intriguer', location: 'lair' });
    s = pick(s, { kind: 'intriguer', location: 'mine' });
    expect(s.pending).toEqual({ kind: 'placement', player: 1 });
    expect(placeActions(s).some((a) => a.location === 'mine')).toBe(false);
    s = act(s, { type: 'pass' }); // p1
    s = act(s, { type: 'pass' }); // p2 → снова p0: блок снят
    expect(s.blocks).toEqual([]);
    expect(placeActions(s).some((a) => a.location === 'mine')).toBe(true);
  });

  it('Ночной охотник: может встать в закрытый второй слот (и вытеснить при совпадении профессии)', () => {
    let s = moveWorker(start(), 'p1w0', at('mine'));
    s = edit(s, (d) => {
      d.locations.mine.slot2Locked = true;
      d.locations.mine.professionToken = 'spy';
    });
    s = give(s, 'p0w1', 'bloodsucker');
    expect(placeActions(s).some((a) => a.workerId === 'p0w1' && a.location === 'mine')).toBe(false);
    s = give(s, 'p0w0', 'nightHunter', 'spy');
    expect(placeActions(s)).toContainEqual({
      type: 'place',
      workerId: 'p0w0',
      location: 'mine',
      slot: 2,
      displace: true,
    });
  });

  it('Лицемер: сменить профессию своего рабочего на любую из пяти', () => {
    let s = give(start(), 'p0w0', 'hypocrite');
    s = give(s, 'p0w1', 'bloodsucker', 'guard');
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    // 2 рабочих с профессией × 4 другие профессии.
    expect(characterChoices(s)).toHaveLength(8);
    s = pick(s, { kind: 'hypocrite', workerId: 'p0w1', profession: 'spy' });
    expect(worker(s, 'p0w1')?.profession).toBe('spy');
  });

  it('Лицемер: новая профессия самого Лицемера срабатывает в этом же размещении (OQ-36)', () => {
    let s = give(start({ gold: 5 }), 'p0w0', 'hypocrite');
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    s = pick(s, { kind: 'hypocrite', workerId: 'p0w0', profession: 'architect' });
    expect(s.pending).toEqual({
      kind: 'build',
      player: 0,
      source: { kind: 'architect', workerId: 'p0w0' },
    });
  });

  it('Шантажист: 2 компромата → забрать 1 влияние у соперника в регионе (не у того, у кого 0)', () => {
    let s = give(start({ compromat: 2 }), 'p0w0', 'blackmailer');
    s = edit(s, (d) => {
      d.players[1]!.influence.forest = 2;
    });
    s = edit(s, (d) => {
      d.players[2]!.influence.forest = 1;
    });
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    expect(characterChoices(s)).toEqual([
      { kind: 'blackmailer', target: 1 },
      { kind: 'blackmailer', target: 2 },
    ]);
    s = pick(s, { kind: 'blackmailer', target: 1 });
    expect(s.players.map((p) => p.influence.forest)).toEqual([1, 1, 1]);
    expect(res(s, 0).compromat).toBe(0);
  });

  it('Шантажист: единственная цель выбирается сама', () => {
    let s = give(start({ compromat: 2 }), 'p0w0', 'blackmailer');
    s = edit(s, (d) => {
      d.players[1]!.influence.forest = 2;
    });
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    expect(s.players.map((p) => p.influence.forest)).toEqual([1, 1, 0]);
  });

  it('Шантажист: без 2 компроматов не срабатывает', () => {
    let s = give(start({ compromat: 1 }), 'p0w0', 'blackmailer');
    s = edit(s, (d) => {
      d.players[1]!.influence.forest = 2;
    });
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    expect(s.pending?.kind).toBe('placement');
  });
});

describe('Персонажи, содержание 3', () => {
  it('Комиссар: свой рабочий из госпиталя сразу размещается с действием, без платы за вход в Город', () => {
    let s = give(start({ gold: 0 }), 'p0w0', 'commissar');
    s = moveWorker(s, 'p0w1', { kind: 'hospital' });
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    expect(characterChoices(s)).toContainEqual({
      kind: 'commissar',
      workerId: 'p0w1',
      location: 'cityHall',
      slot: 1,
      displace: false,
    });
    s = pick(s, {
      kind: 'commissar',
      workerId: 'p0w1',
      location: 'mine',
      slot: 1,
      displace: false,
    });
    expect(worker(s, 'p0w1')?.position).toEqual(at('mine'));
    // Рудник (вернувшийся рабочий) + Логово (Комиссар); ход перешёл дальше один раз.
    expect(res(s, 0)).toMatchObject({ gold: 3, ore: 1 });
    expect(s.pending).toEqual({ kind: 'placement', player: 1 });
  });

  it('Комиссар: персонаж вернувшегося рабочего тоже срабатывает (OQ-37)', () => {
    let s = give(start(), 'p0w0', 'commissar');
    s = give(s, 'p0w1', 'bloodsucker');
    s = moveWorker(s, 'p0w1', { kind: 'hospital' });
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    s = pick(s, {
      kind: 'commissar',
      workerId: 'p0w1',
      location: 'witchCircle',
      slot: 1,
      displace: false,
    });
    expect(res(s, 0).blood).toBe(3 + 1);
  });

  it('Диверсант: удаляет чужие жетоны силы в регионе, +1 золото за каждый', () => {
    let s = give(start(), 'p0w0', 'saboteur');
    s = edit(s, (d) => {
      d.powerTokens.push(
        { owner: 1, region: 'forest', count: 2 },
        { owner: 2, region: 'valley', count: 1 },
        { owner: 0, region: 'forest', count: 1 },
      );
    });
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    expect(res(s, 0).gold).toBe(2 + 2);
    expect(s.powerTokens).toEqual([
      { owner: 2, region: 'valley', count: 1 },
      { owner: 0, region: 'forest', count: 1 },
    ]);
  });

  it('Меценат: +1 влияние и +1 за каждое своё здание в регионе, всего не больше 3', () => {
    let s = give(start(), 'p0w0', 'patron');
    s = edit(s, (d) => {
      d.buildings.push({ type: 'crypt', owner: 0, region: 'forest', plot: 'forest-mine' });
    });
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    expect(s.players[0]?.influence.forest).toBe(2);
    let t = give(start(), 'p0w0', 'patron');
    t = edit(t, (d) => {
      for (const plot of ['forest-mine', 'forest-lair', 'forest-witchCircle']) {
        d.buildings.push({ type: 'crypt', owner: 0, region: 'forest', plot });
      }
    });
    t = place(t, 'lair', 1, { workerId: 'p0w0' });
    expect(t.players[0]?.influence.forest).toBe(3);
  });

  it('Рудный барон: 2 руды на карту; получи их, если остался в регионе и выиграл там бой', () => {
    let s = give(start({ blood: 5 }), 'p0w0', 'oreBaron');
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    s = finishRound(s);
    expect(res(s, 0).ore).toBe(2);
  });

  it('Рудный барон: бой проигран — руда в банк', () => {
    let s = give(start({ blood: 5 }), 'p0w0', 'oreBaron');
    s = give(s, 'p1w0', 'bloodsucker', 'spy');
    s = moveWorker(s, 'p1w0', at('witchCircle'));
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    s = finishRound(s);
    expect(res(s, 0).ore).toBe(0);
  });

  it('Могильщик: другие свои рабочие региона — в госпиталь (не вытеснение), +1 руда за каждого', () => {
    let s = moveWorker(start(), 'p0w1', at('witchCircle'));
    s = moveWorker(s, 'p0w2', at('lair', 2));
    s = give(s, 'p0w0', 'gravedigger');
    s = edit(s, (d) => {
      d.buildings.push({ type: 'abbey', owner: 1, region: 'forest', plot: 'forest-witchCircle' });
    });
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    expect(characterChoices(s)).toHaveLength(4);
    s = pick(s, { kind: 'gravedigger', workerIds: ['p0w1', 'p0w2'] });
    expect(worker(s, 'p0w1')?.position.kind).toBe('hospital');
    expect(worker(s, 'p0w2')?.position.kind).toBe('hospital');
    expect(res(s, 0).ore).toBe(2);
    expect(res(s, 1).blood).toBe(0); // не вытеснение — Аббатство молчит
  });

  it('Тактик: вернуть другого своего рабочего с поля в запас; его можно выставить снова', () => {
    let s = moveWorker(start(), 'p0w1', at('witchCircle'));
    s = give(s, 'p0w0', 'tactician');
    s = moveWorker(s, 'p0w2', at('lair', 2));
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    expect(characterChoices(s)).toEqual([
      { kind: 'tactician', workerId: 'p0w1' },
      { kind: 'tactician', workerId: 'p0w2' },
    ]);
    s = pick(s, { kind: 'tactician', workerId: 'p0w1' });
    expect(worker(s, 'p0w1')?.position).toEqual({ kind: 'reserve' });
    expect(
      placeActions(turnTo(s, 0)).some((a) => a.workerId === 'p0w1' && a.location === 'witchCircle'),
    ).toBe(true);
  });
});

describe('Общие правила эффектов', () => {
  it('Эффект персонажа срабатывает до действия локации', () => {
    let s = give(start({ compromat: 0 }), 'p0w0', 'informant');
    s = place(s, 'chancery', 1, { workerId: 'p0w0' });
    // Компромат Информатора уже можно тратить в Канцелярии.
    expect(
      getLegalActions(s).some((a) => a.type === 'locationAction' && a.choice.kind === 'chancery'),
    ).toBe(true);
  });

  it('Таверна: новый персонаж в этом размещении не срабатывает', () => {
    let s = give(start(), 'p0w0', 'storekeeper');
    s = edit(s, (d) => {
      const i = d.deck.indexOf('bloodsucker');
      d.deck.splice(i, 1);
      d.offer = { characters: ['bloodsucker'], professions: ['spy'] };
    });
    s = place(s, 'tavern', 1, { workerId: 'p0w0' });
    s = act(s, {
      type: 'locationAction',
      choice: { kind: 'tavernSwap', character: 'bloodsucker', profession: 'spy' },
    });
    expect(worker(s, 'p0w0')?.character).toBe('bloodsucker');
    expect(res(s, 0)).toMatchObject({ gold: 4, blood: 0 });
  });

  it('Копирование через Подполье не вызывает эффект персонажа повторно', () => {
    let s = give(start({ gold: 5 }), 'p0w0', 'storekeeper');
    s = place(s, 'underground', 1, { workerId: 'p0w0' });
    expect(res(s, 0).gold).toBe(5 - 1 + 2);
    s = act(s, { type: 'locationAction', choice: { kind: 'copy', location: 'mine', slot: 1 } });
    expect(res(s, 0).gold).toBe(5 - 1 + 2 - 1 + 3);
  });
});

describe('Крайние случаи персонажей (ревью)', () => {
  it('Доносчик, возвращённый Тактиком: компромат с карты уходит в банк; выставлен снова — одна запись', () => {
    let s = give(start(), 'p0w1', 'snitch', 'aristocrat');
    s = place(s, 'witchCircle', 1, { workerId: 'p0w1' });
    expect(s.cardStash).toHaveLength(1);
    s = give(turnTo(s, 0), 'p0w0', 'tactician');
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    expect(s.cardStash).toEqual([]);
    s = place(turnTo(s, 0), 'lair', 1, { workerId: 'p0w1' });
    expect(s.cardStash).toHaveLength(1);
  });

  it('OQ-44 (автор): рабочего, не доигравшего свой ход, нельзя убрать с поля (Тактик в цепочке Комиссара)', () => {
    let s = give(start(), 'p0w0', 'commissar');
    s = give(s, 'p0w1', 'tactician');
    s = moveWorker(s, 'p0w1', { kind: 'hospital' });
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    s = pick(s, {
      kind: 'commissar',
      workerId: 'p0w1',
      location: 'lair',
      slot: 1,
      displace: false,
    });
    // Тактику некого вернуть: Комиссар ещё выполняет ход. Оба действия выполнены.
    expect(worker(s, 'p0w0')?.position).toEqual(at('mine'));
    expect(res(s, 0)).toMatchObject({ gold: 5, ore: 1 });
  });

  it('OQ-43 (автор): Ренегат не предлагает стройку, если после потери влияния строить нечего', () => {
    let s = give(start({ gold: 7, ore: 3 }), 'p0w0', 'renegade');
    s = edit(s, (d) => {
      d.players[0]!.influence.forest = 4;
      // Все участки Леса заняты — остаётся только Цитадель.
      for (const plot of [
        'forest-mine',
        'forest-witchCircle',
        'forest-lair',
        'forest-mine-lair',
        'forest-mine-witchCircle',
      ]) {
        const owner = d.buildings.filter((b) => b.owner === 1).length < 3 ? 1 : 2;
        d.buildings.push({ type: 'abbey', owner, region: 'forest', plot });
      }
    });
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    // Только руда — выбрана сама.
    expect(s.players[0]?.influence.forest).toBe(3);
    expect(res(s, 0).ore).toBe(3 + 1 + 1);
  });

  it('Интриган: если до владельца очередь не дошла, блок переходит в следующий раунд', () => {
    let s = edit(give(start(), 'p0w0', 'intriguer'), (d) => {
      d.firstPlayer = 1;
      for (const w of d.workers) if (w.owner !== 0) w.position = { kind: 'hospital' };
      d.workers.find((w) => w.id === 'p0w1')!.position = { kind: 'hospital' };
      d.workers.find((w) => w.id === 'p0w2')!.position = { kind: 'hospital' };
    });
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    s = pick(s, { kind: 'intriguer', location: 'mine' });
    // Больше никто не может ходить — размещение окончено, блок жив.
    expect(s.blocks).toEqual([{ location: 'mine', owner: 0 }]);
  });

  it('Палач против пары с Лазутчиком: вылетают оба; Страж в паре защищает только себя (OQ-34)', () => {
    let s = moveWorker(start(), 'p1w0', at('witchCircle'));
    s = give(s, 'p2w0', 'infiltrator', 'aristocrat');
    s = moveWorker(s, 'p2w0', at('witchCircle'));
    s = give(s, 'p0w0', 'bloodsucker', 'executioner');
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    s = act(s, { type: 'executioner', target: 'p1w0' });
    expect(worker(s, 'p1w0')?.position.kind).toBe('hospital');
    expect(worker(s, 'p2w0')?.position.kind).toBe('hospital');

    let t = give(start(), 'p1w0', 'officer', 'guard');
    t = moveWorker(t, 'p1w0', at('witchCircle'));
    t = give(t, 'p2w0', 'infiltrator', 'aristocrat');
    t = moveWorker(t, 'p2w0', at('witchCircle'));
    t = give(t, 'p0w0', 'bloodsucker', 'executioner');
    t = place(t, 'mine', 1, { workerId: 'p0w0' });
    // Цель — только Лазутчик; Страж остаётся в слоте.
    expect(getLegalActions(t)).toEqual([
      { type: 'executioner', target: 'p2w0' },
      { type: 'executioner', target: null },
    ]);
    t = act(t, { type: 'executioner', target: 'p2w0' });
    expect(worker(t, 'p2w0')?.position.kind).toBe('hospital');
    expect(worker(t, 'p1w0')?.position).toEqual(at('witchCircle'));
  });

  it('Ночной охотник в закрытом втором слоте: замок остаётся, инварианты не нарушены', () => {
    let s = moveWorker(start(), 'p1w0', at('mine'));
    s = edit(s, (d) => {
      d.locations.mine.slot2Locked = true;
    });
    s = give(s, 'p0w0', 'nightHunter');
    s = place(s, 'mine', 2, { workerId: 'p0w0' });
    expect(worker(s, 'p0w0')?.position).toEqual(at('mine', 2));
    expect(s.locations.mine.slot2Locked).toBe(true);
    expect(res(s, 0).gold).toBe(4);
  });
});

describe('Найдено симулятором', () => {
  it('Ночной охотник в закрытом слоте, сброшенный на содержании, не нарушает инварианты', () => {
    let s = moveWorker(start({ blood: 0 }), 'p1w0', at('mine'));
    s = edit(s, (d) => {
      d.locations.mine.slot2Locked = true;
    });
    s = give(s, 'p0w0', 'nightHunter');
    s = place(s, 'mine', 2, { workerId: 'p0w0' });
    // Содержание 2 крови — нечем платить, пара сбрасывается, пока рабочий ещё в слоте.
    s = finishRound(s);
    expect(worker(s, 'p0w0')?.character).toBeNull();
    expect(s.round).toBe(2);
  });
});

describe('Найдено в игре', () => {
  it('Алхимик: замена руды на золото — один раз за размещение (ответ автора, 22.11)', () => {
    // Алхимик-Архитектор на Рынке: продать «руду» за 1 золото, потом стройка — уже без замены.
    let s = give(start({ gold: 2, ore: 0 }), 'p0w0', 'alchemist', 'architect');
    s = place(s, 'market', 1, { workerId: 'p0w0' });
    s = act(s, {
      type: 'locationAction',
      choice: { kind: 'marketSell', receive: { gold: 4, blood: 0 }, alchemy: true },
    });
    expect(res(s, 0)).toMatchObject({ gold: 5, ore: 0 });
    // Лавка (3 золота + 1 руда) без руды больше недоступна; Склеп и Аббатство — да.
    const builds = getLegalActions(s).flatMap((a) =>
      a.type === 'build' && a.choice ? [a.choice] : [],
    );
    expect(builds.some((b) => b.alchemy)).toBe(false);
    expect(builds.some((b) => b.building === 'shop')).toBe(false);
    expect(builds.some((b) => b.building === 'abbey')).toBe(true);
  });
});
