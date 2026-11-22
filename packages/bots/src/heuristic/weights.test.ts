import { createGame, type GameState } from '@vampire/core';
import { BUILDINGS } from '@vampire/data';
import { describe, expect, it } from 'vitest';
import { futureShare, playerValue } from './evaluate';
import { WEIGHTS, WEIGHTS_ARISTO, WEIGHTS_PREV } from './weights';

const withCrypts = (s: GameState, n: number): GameState => ({
  ...s,
  buildings: Array.from({ length: n }, () => ({
    type: 'crypt' as const,
    owner: 0,
    region: 'forest' as const,
    plot: null,
  })),
});

/** Первый рабочий игрока 0 — с персонажем и выбранной профессией. */
const withWorker = (s: GameState, profession: 'aristocrat' | 'guard'): GameState => ({
  ...s,
  workers: s.workers.map((w) =>
    w.id === 'p0w0' ? { ...w, character: 'bloodsucker', profession } : w,
  ),
});

describe('Находки агентов в оценке бота (22.11)', () => {
  it('Цепочка Склепов: по умолчанию второй Склеп ценнее на долю обещанного третьего (8 престижа)', () => {
    const s = createGame({}, 1);
    const gain = (w: typeof WEIGHTS) =>
      playerValue(withCrypts(s, 2), 0, w) - playerValue(withCrypts(s, 1), 0, w);
    const third = BUILDINGS.crypt.prestige[2] ?? 0;
    const second = BUILDINGS.crypt.prestige[1] ?? 0;
    // Обещание растёт с престижа второго Склепа до престижа третьего (с долей оставшейся партии).
    const w = WEIGHTS;
    const expected = w.buildingChain * futureShare(s) * (third - second) * w.prestigeVp;
    expect(gain(w) - gain({ ...WEIGHTS, buildingChain: 0 })).toBeCloseTo(expected, 6);
    expect(gain(WEIGHTS)).toBeGreaterThan(gain(WEIGHTS_PREV));
  });

  it('Аристократ ценнее другой профессии, когда вход в Город подорожал', () => {
    const base = createGame({}, 1);
    const raised: GameState = { ...base, cityEntryRaisedRegions: ['forest', 'valley'] };
    const edge = (s: GameState) =>
      playerValue(withWorker(s, 'aristocrat'), 0, WEIGHTS_ARISTO) -
      playerValue(withWorker(s, 'guard'), 0, WEIGHTS_ARISTO);
    expect(edge(base)).toBeGreaterThan(0);
    expect(edge(raised)).toBeGreaterThan(edge(base));
    // Без веса Аристократ не отличается от Стража.
    const plain = (s: GameState) =>
      playerValue(withWorker(s, 'aristocrat'), 0, WEIGHTS) -
      playerValue(withWorker(s, 'guard'), 0, WEIGHTS);
    expect(plain(raised)).toBeCloseTo(0, 6);
  });
});
