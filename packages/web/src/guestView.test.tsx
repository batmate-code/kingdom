import { BOT_FACTORIES } from '@vampire/bots';
import {
  applyAction,
  createGame,
  getLegalActions,
  getObservation,
  isTerminal,
} from '@vampire/core';
import { describe, expect, it } from 'vitest';
import { checkGuestView } from './screenCheck';

/**
 * Онлайн, этап 1: экран гостя (из determinize его наблюдения) совпадает с настоящим экраном
 * этого игрока — значит, экран не зависит от скрытого. Короткий вариант для `npm test`;
 * полный — в uiStress.test.tsx (UI_STRESS=N).
 */

const GAMES = [101, 202];
/** Проверять каждый N-й ход (полный экран ×3 зрителя ×2 догадки — дорого). */
const EVERY = 4;
const GUESSES = 2;

describe('Онлайн: экран гостя без утечек', () => {
  it(
    'Экран гостя совпадает с настоящим экраном игрока на всём протяжении партии',
    { timeout: 0 },
    () => {
      let checked = 0;
      for (const seed of GAMES) {
        let state = createGame({ playerCount: 3 }, seed);
        const bots = [0, 1, 2].map((i) => BOT_FACTORIES.random!(seed * 10 + i));
        for (let step = 0; !isTerminal(state); step++) {
          if (step % EVERY === 0) {
            for (const viewer of [0, 1, 2]) {
              for (let g = 0; g < GUESSES; g++)
                checkGuestView(state, viewer, seed * 10_000 + step * 10 + g);
            }
            checked++;
          }
          const player = state.pending!.player;
          const action = bots[player]!.chooseAction(
            getObservation(state, player),
            getLegalActions(state),
          );
          state = applyAction(state, action).state;
        }
      }
      expect(checked).toBeGreaterThan(50);
    },
  );
});
