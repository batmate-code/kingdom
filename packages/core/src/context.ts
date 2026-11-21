import type { GameEvent, GameState } from './types';

/** Изменяемый черновик состояния (Immer) и события, накопленные за действие. */
export interface Ctx {
  draft: GameState;
  events: GameEvent[];
}
