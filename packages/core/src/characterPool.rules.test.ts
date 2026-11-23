/** Прогоны баланса (автор 23.11): колода только из выбранных персонажей, продублированных до 30 карт. */
import { CHARACTER_ORDER, type CharacterId } from '@vampire/data';
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getLegalActions, isTerminal } from './engine';

const POOL: CharacterId[] = [
  'bloodsucker',
  'storekeeper',
  'oreMiner',
  'chronicler',
  'officer',
  'mason',
  'treasurer',
];

describe('Колода прогонов (config.characterPool)', () => {
  it('Колода: только персонажи из списка; партия доигрывается до конца', () => {
    let s = createGame({ playerCount: 3, characterPool: POOL }, 3);
    // Драфт 1-го раунда уже выложен; копии добивают колоду до полного размера.
    const cards = [...s.deck, ...s.offer.characters];
    expect(cards).toHaveLength(
      CHARACTER_ORDER.length +
        ((POOL.length - (CHARACTER_ORDER.length % POOL.length)) % POOL.length),
    );
    expect(new Set(cards)).toEqual(new Set(POOL));
    const seen = new Set<CharacterId>();
    let guard = 0;
    while (!isTerminal(s) && guard++ < 5000) {
      for (const c of s.offer.characters) seen.add(c);
      s = applyAction(s, getLegalActions(s)[0]!).state;
    }
    expect(isTerminal(s)).toBe(true);
    expect([...seen].every((c) => POOL.includes(c))).toBe(true);
  });
});
