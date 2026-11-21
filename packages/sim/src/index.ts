import type { Bot } from '@vampire/bots';
import {
  applyAction,
  createGame,
  getLegalActions,
  getObservation,
  isTerminal,
  type GameConfigInput,
  type GameState,
} from '@vampire/core';

/** Сыграть одну партию ботами (по боту на кресло). Полноценный симулятор — этап 6. */
export function playGame(config: GameConfigInput, seed: number, bots: readonly Bot[]): GameState {
  let state = createGame(config, seed);
  while (!isTerminal(state)) {
    const player = state.pending?.player;
    if (player === undefined) throw new Error('Партия не окончена, но никто не ходит');
    const bot = bots[player];
    if (!bot) throw new Error(`Нет бота для кресла ${player}`);
    state = applyAction(
      state,
      bot.chooseAction(getObservation(state, player), getLegalActions(state)),
    ).state;
  }
  return state;
}
