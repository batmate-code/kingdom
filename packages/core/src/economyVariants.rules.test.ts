import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { LOCATIONS } from '@vampire/data';
import { buildCost } from './buildings';
import { changeInfluence, cityEntryPrice } from './economy';
import { createGame } from './engine';
import type { GameEvent, GameState } from './types';
import { choose, edit, newGame, place, placeActions, res, setResources, turnTo } from './testing';

/** Изменить влияние так, как это делает ядро, и вернуть события. */
function influence(
  s: GameState,
  player: number,
  region: 'forest' | 'valley' | 'city',
  amount: number,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const state = produce(s, (draft) => {
    changeInfluence({ draft, events }, player, region, amount, 'combat');
  });
  return { state, events };
}

describe('Правила автора 23.11: старт, вход в Город, бонусы треков', () => {
  it('по умолчанию: вход в Город — кровь + золото за подорожания, бонусы треков включены, участки за руду, старт без крови', () => {
    const s = createGame({}, 1);
    expect(s.config.rules.cityEntryResource).toBe('mixed');
    expect(s.config.rules.plotSurcharge).toBe('ore');
    expect(s.config.rules.massBloodToGold).toBe('weak');
    expect(s.config.rules.citadelCost).toBe('cheap');
    expect(s.config.rules.trackBoosts).toBe(true);
    expect(res(s, 0)).toMatchObject({ gold: 2, blood: 0 });
  });

  it('startResources=blood2: на старте +2 крови, база — без крови', () => {
    expect(res(newGame(), 0).blood).toBe(0);
    expect(res(newGame({ rules: { startResources: 'blood2' } }), 0)).toMatchObject({
      gold: 2,
      blood: 2,
    });
  });

  it('cityEntryResource=blood: вход в Город платится кровью', () => {
    const s = turnTo(
      newGame({ rules: { startResources: 'blood2', cityEntryResource: 'blood' } }),
      0,
    );
    const log: GameEvent[] = [];
    const after = place(s, 'chancery', 1, { log });
    expect(res(after, 0)).toMatchObject({ gold: 2, blood: 1 });
    expect(log).toContainEqual({ type: 'cityEntryPaid', player: 0, price: { blood: 1 } });
  });

  it('cityEntryResource=mixed: база 1 кровь, каждое подорожание — +1 золото (правило автора)', () => {
    const base = newGame({ rules: { cityEntryResource: 'mixed' } });
    expect(cityEntryPrice(base)).toEqual({ blood: 1 });
    const one = edit(base, (d) => {
      d.cityEntryRaisedRegions = ['forest'];
    });
    expect(cityEntryPrice(one)).toEqual({ blood: 1, gold: 1 });
    const two = edit(base, (d) => {
      d.cityEntryRaisedRegions = ['forest', 'valley'];
    });
    expect(cityEntryPrice(two)).toEqual({ blood: 1, gold: 2 });
  });

  it('cityEntryResource=mixed: при входе списываются и кровь, и золото; без крови в Город нельзя', () => {
    let s = edit(turnTo(newGame({ rules: { cityEntryResource: 'mixed' } }), 0), (d) => {
      d.cityEntryRaisedRegions = ['forest'];
    });
    s = setResources(s, 0, { gold: 3, blood: 2 });
    const log: GameEvent[] = [];
    const after = place(s, 'chancery', 1, { log });
    expect(res(after, 0)).toMatchObject({ gold: 2, blood: 1 });
    expect(log).toContainEqual({ type: 'cityEntryPaid', player: 0, price: { blood: 1, gold: 1 } });

    const noBlood = setResources(s, 0, { gold: 5, blood: 0 });
    const inCity = placeActions(noBlood).filter((a) => LOCATIONS[a.location].region === 'city');
    expect(inCity).toEqual([]);
  });

  it('massBloodToGold=weak: кровь → золото 1 → 2 и 1 → 1, золото → кровь без изменений', () => {
    const weak = (r: { gold: number; blood: number }) =>
      setResources(turnTo(newGame({ rules: { massBloodToGold: 'weak' } }), 0), 0, r);
    let s = choose(place(weak({ gold: 0, blood: 2 }), 'mass', 1), {
      kind: 'mass',
      from: 'blood',
      times: 2,
    });
    expect(res(s, 0)).toMatchObject({ gold: 4, blood: 0 });
    s = choose(place(weak({ gold: 0, blood: 2 }), 'mass', 2), {
      kind: 'mass',
      from: 'blood',
      times: 2,
    });
    expect(res(s, 0)).toMatchObject({ gold: 2, blood: 0 });
    s = choose(place(weak({ gold: 2, blood: 0 }), 'mass', 1), {
      kind: 'mass',
      from: 'gold',
      times: 2,
    });
    expect(res(s, 0)).toMatchObject({ gold: 0, blood: 6 });
  });

  it('citadelCost=cheap: Цитадель стоит 6 золота и 2 руды вместо 7 и 3', () => {
    const citadel = { building: 'citadel', region: 'forest', plot: null } as const;
    expect(buildCost(newGame({ rules: { citadelCost: 'base' } }), citadel)).toEqual({
      gold: 7,
      ore: 3,
    });
    expect(buildCost(newGame({ rules: { citadelCost: 'cheap' } }), citadel)).toEqual({
      gold: 6,
      ore: 2,
    });
  });

  it('trackBoosts: бонус за позицию один раз за партию', () => {
    const s = newGame({ rules: { trackBoosts: true } });
    const gold = res(s, 0).gold;
    const a = influence(s, 0, 'forest', 2);
    expect(res(a.state, 0).gold).toBe(gold + 2);
    expect(a.events).toContainEqual({ type: 'trackBoost', player: 0, region: 'forest', at: 2 });
    // Потерял и вернул влияние — второй раз бонуса нет.
    const b = influence(influence(a.state, 0, 'forest', -2).state, 0, 'forest', 2);
    expect(res(b.state, 0).gold).toBe(gold + 2);
  });

  it('trackBoosts: Город — руда на 2 и 4, прыжок через обе позиции даёт обе', () => {
    const s = newGame({ rules: { trackBoosts: true } });
    const ore = res(s, 1).ore;
    expect(res(influence(s, 1, 'city', 4).state, 1).ore).toBe(ore + 2);
    expect(res(influence(s, 1, 'valley', 2).state, 1).blood).toBe(res(s, 1).blood + 2);
  });

  it('без переключателя бонусов нет', () => {
    const s = newGame();
    expect(res(influence(s, 0, 'forest', 2).state, 0).gold).toBe(res(s, 0).gold);
  });
});
