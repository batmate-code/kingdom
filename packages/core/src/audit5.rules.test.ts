/** Аудит этапа 5: сценарии по пунктам правил, не закрытые characters.rules.test.ts. */
import {
  CHARACTER_PARAMS,
  type CharacterId,
  type LocationId,
  type ProfessionId,
} from '@vampire/data';
import { describe, expect, it } from 'vitest';
import { getLegalActions } from './engine';
import type { Action, BuildChoice, CharacterChoice, GameState } from './types';
import {
  act,
  edit,
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

const at = (location: LocationId, slot: 1 | 2 = 1) => ({ kind: 'slot', location, slot }) as const;

const start = (r: Parameters<typeof setResources>[2] = {}) =>
  setResources(turnTo(newGame(), 0), 0, r);

const give = (
  s: GameState,
  workerId: string,
  character: CharacterId,
  profession: ProfessionId = 'guard',
) => setWorker(s, workerId, { character, profession });

const worker = (s: GameState, id: string) => s.workers.find((w) => w.id === id);

const buildChoices = (s: GameState): BuildChoice[] =>
  getLegalActions(s).flatMap((a) => (a.type === 'build' && a.choice ? [a.choice] : []));

const characterChoices = (s: GameState): CharacterChoice[] =>
  getLegalActions(s).flatMap((a) => (a.type === 'character' ? [a.choice] : []));

describe('Аудит этапа 5: размещение и вытеснение', () => {
  it('Лазутчик + Страж: «Страж не может быть вытеснен» — пара со Стражем защищена при вытеснении из второго слота', () => {
    let s = moveWorker(start(), 'p1w0', at('mine'));
    s = give(s, 'p1w0', 'storekeeper', 'guard');
    s = give(s, 'p0w0', 'infiltrator', 'aristocrat');
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    s = edit(turnTo(s, 2), (d) => {
      d.locations.mine.professionToken = 'spy';
    });
    s = give(s, 'p2w0', 'bloodsucker', 'spy');
    expect(placeActions(s).some((a) => a.location === 'mine' && a.displace)).toBe(false);
  });

  it('Ночной охотник: закрытый второй слот без совпадения профессии — обычное действие второго слота, без вытеснения', () => {
    let s = moveWorker(start(), 'p1w0', at('mine'));
    s = edit(s, (d) => {
      d.locations.mine.slot2Locked = true;
      d.locations.mine.professionToken = 'spy';
    });
    s = give(s, 'p0w0', 'nightHunter', 'aristocrat');
    const actions = placeActions(s).filter((a) => a.workerId === 'p0w0' && a.location === 'mine');
    expect(actions).toEqual([
      { type: 'place', workerId: 'p0w0', location: 'mine', slot: 2, displace: false },
    ]);
    s = place(s, 'mine', 2, { workerId: 'p0w0' });
    expect(res(s, 0).gold).toBe(4); // +2 золота второго слота Рудника
  });

  it('Палач + Мародёр + Доносчик + Аббатство: вытеснение Палачом считается вытеснением, замок не ставится (ответ автора, «Палач»)', () => {
    let s = give(start(), 'p1w0', 'snitch', 'aristocrat');
    s = edit(turnTo(s, 1), (d) => {
      d.buildings.push({ type: 'abbey', owner: 2, region: 'forest', plot: 'forest-witchCircle' });
    });
    s = place(s, 'witchCircle', 1, { workerId: 'p1w0' });
    s = give(turnTo(s, 0), 'p0w0', 'marauder', 'executioner');
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    s = act(s, { type: 'executioner', target: 'p1w0' });
    expect(worker(s, 'p1w0')?.position.kind).toBe('hospital');
    expect(res(s, 1).compromat).toBe(1 + CHARACTER_PARAMS.snitch.compromat); // 1 от Палача (автор, 23.11) + компромат Доносчика
    expect(res(s, 0).gold).toBe(2 + 3 + 2); // Рудник + Мародёр
    expect(res(s, 2).blood).toBe(2); // Аббатство
    expect(s.locations.witchCircle.slot2Locked).toBe(false);
  });
});

describe('Аудит этапа 5: эффекты персонажей и экономика', () => {
  it('Алхимик + Архитектор: постройку Лавки можно оплатить 4 золотом вместо 3 золота + 1 руды', () => {
    let s = give(start({ gold: 1 }), 'p0w0', 'alchemist', 'architect');
    s = place(s, 'mine', 1, { workerId: 'p0w0' }); // +3 золота → 4
    expect(buildChoices(s)).toContainEqual({
      building: 'shop',
      region: 'forest',
      plot: 'forest-mine',
      alchemy: true,
    });
    s = act(s, {
      type: 'build',
      choice: { building: 'shop', region: 'forest', plot: 'forest-mine', alchemy: true },
    });
    expect(res(s, 0)).toMatchObject({ gold: 0, ore: 0 });
  });

  it('Алхимик + Канцелярия: право стройки (3 компромата) можно оплатить заменой руды золотом', () => {
    let s = give(start({ gold: 4, compromat: 3 }), 'p0w0', 'alchemist', 'aristocrat');
    s = place(s, 'chancery', 2, { workerId: 'p0w0' });
    s = act(s, { type: 'locationAction', choice: { kind: 'buildRight' } });
    expect(buildChoices(s).some((c) => c.building === 'shop' && c.alchemy === true)).toBe(true);
  });

  it('Безумец: копия первого слота другой локации не считается посещением (Лавка соперника молчит)', () => {
    let s = give(start(), 'p0w0', 'madman', 'aristocrat');
    s = edit(s, (d) => {
      d.buildings.push({ type: 'shop', owner: 1, region: 'forest', plot: 'forest-witchCircle' });
    });
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    s = act(s, { type: 'character', choice: { kind: 'madman', location: 'witchCircle' } });
    expect(res(s, 0).blood).toBe(3);
    expect(res(s, 1).gold).toBe(2);
  });

  it('Рудный барон (автор 23.11): Шпион ушёл в другой регион и выиграл там бой — руда его', () => {
    let s = give(start({ blood: 5 }), 'p0w0', 'oreBaron', 'spy');
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    let guard = 0;
    while (s.pending && s.pending.kind !== 'spyMove' && guard++ < 50) {
      s = act(s, s.pending.kind === 'placement' ? { type: 'pass' } : firstAction(s));
    }
    expect(s.pending?.kind).toBe('spyMove');
    s = act(s, { type: 'spyMove', region: 'valley', location: 'market', slot: 1 });
    s = passAll(s);
    expect(res(s, 0).ore).toBe(CHARACTER_PARAMS.oreBaron.ore);
  });

  it('Могильщик: отправленный в госпиталь Доносчик не приносит владельцу компромат (не вытеснение)', () => {
    let s = give(start({ blood: 5 }), 'p0w0', 'snitch', 'aristocrat');
    s = give(s, 'p0w1', 'gravedigger', 'aristocrat');
    s = place(s, 'witchCircle', 1, { workerId: 'p0w0' });
    s = place(turnTo(s, 0), 'mine', 1, { workerId: 'p0w1' });
    s = act(s, { type: 'character', choice: { kind: 'gravedigger', workerIds: ['p0w0'] } });
    expect(res(s, 0).compromat).toBe(0);
    s = passAll(s);
    expect(res(s, 0).compromat).toBe(0);
  });
});

describe('Аудит этапа 5: Интриган, Комиссар, Оборотень', () => {
  it('Интриган: если до владельца не дошла очередь, блок переходит в следующий раунд и снимается на его первой очереди (ответ автора)', () => {
    let s = give(start({ blood: 9 }), 'p0w0', 'intriguer', 'aristocrat');
    s = moveWorker(s, 'p0w1', at('witchCircle'));
    s = moveWorker(s, 'p0w2', at('lair', 2));
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    s = act(s, { type: 'character', choice: { kind: 'intriguer', location: 'market' } });
    s = act(s, { type: 'pass' }); // p1
    s = act(s, { type: 'pass' }); // p2: у p0 нет рабочих в запасе, до боёв очередь не дошла
    expect(s.blocks).toEqual([{ location: 'market', owner: 0 }]);
    s = passAll(s);
    expect(s.round).toBe(2);
    expect(s.blocks).toEqual([{ location: 'market', owner: 0 }]);
    expect(placeActions(s).some((a) => a.location === 'market')).toBe(false);
    expect(s.pending).toEqual({ kind: 'placement', player: 2 });
    s = act(s, { type: 'pass' }); // p2; следующий — p0
    expect(s.pending).toEqual({ kind: 'placement', player: 0 });
    expect(s.blocks).toEqual([]);
  });

  it('OQ-42 (автор): рабочий, который ещё выполняет свой ход (Комиссар), не может быть вытеснен', () => {
    let s = give(start(), 'p0w0', 'commissar', 'aristocrat');
    s = give(s, 'p0w1', 'bloodsucker', 'spy');
    s = moveWorker(s, 'p0w1', { kind: 'hospital' });
    s = edit(s, (d) => {
      d.locations.lair.professionToken = 'spy';
      d.config.rules.allowDisplaceOwnWorker = true;
    });
    s = place(s, 'lair', 1, { workerId: 'p0w0' });
    expect(characterChoices(s)).not.toContainEqual({
      kind: 'commissar',
      workerId: 'p0w1',
      location: 'lair',
      slot: 2,
      displace: true,
    });
    // Во второй слот без вытеснения — можно.
    expect(characterChoices(s)).toContainEqual({
      kind: 'commissar',
      workerId: 'p0w1',
      location: 'lair',
      slot: 2,
      displace: false,
    });
  });

  it('OQ-40 (автор): при замене пары в Таверне ресурсы с карты Доносчика уходят в банк', () => {
    let s = give(start(), 'p0w0', 'snitch', 'aristocrat');
    s = edit(s, (d) => {
      d.deck.splice(d.deck.indexOf('bloodsucker'), 1);
      d.offer = { characters: ['bloodsucker'], professions: ['spy'] };
    });
    s = place(s, 'tavern', 1, { workerId: 'p0w0' });
    expect(s.cardStash).toHaveLength(1);
    s = act(s, {
      type: 'locationAction',
      choice: { kind: 'tavernSwap', character: 'bloodsucker', profession: 'spy' },
    });
    expect(s.cardStash).toEqual([]);
  });

  // Расхождение с ответом автора (OQ-41): combatStrengths прибавляет жетон Комиссариата.
  it('Оборотень: жетон Комиссариата соперника не входит в «текущую силу» (ответ автора: рабочие + жетоны силы + Склепы + Цитадель Леса)', () => {
    let s = give(start(), 'p0w0', 'werewolf', 'aristocrat');
    s = moveWorker(s, 'p1w0', at('witchCircle'));
    s = moveWorker(s, 'p2w0', { kind: 'hospital' });
    s = moveWorker(s, 'p2w1', { kind: 'hospital' });
    s = edit(s, (d) => {
      d.commissariat = { owner: 1, region: 'forest' };
    });
    s = place(s, 'mine', 1, { workerId: 'p0w0' });
    // Соперник: 1 рабочий = 1; с жетоном Комиссариата было бы 3 (2+ больше моей 1).
    expect(s.powerTokens).toEqual([]);
  });
});

function firstAction(s: GameState): Action {
  return getLegalActions(s)[0] as Action;
}
