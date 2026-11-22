import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { changeInfluence } from './economy';
import { createGame } from './engine';
import type { GameEvent, GameState } from './types';
import { newGame, place, res, turnTo } from './testing';

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
  it('по умолчанию: вход в Город кровью, бонусы треков включены, старт без крови', () => {
    const s = createGame({}, 1);
    expect(s.config.rules.cityEntryResource).toBe('blood');
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
    expect(log).toContainEqual({ type: 'cityEntryPaid', player: 0, cost: 1, resource: 'blood' });
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
