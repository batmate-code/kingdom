import { createGame } from '@vampire/core';

/** Заглушка до этапа 7: показать, что ядро работает в браузере. */
export function appVersionLine(seed = 1): string {
  const state = createGame({ playerCount: 3 }, seed);
  return `Ядро подключено: раунд ${state.round}, первый игрок ${state.firstPlayer + 1}`;
}
