import { GAME, LOCATION_ORDER, REGION_ORDER, TRACKS, type ResourceId } from '@vampire/data';
import { workersAt } from './board';
import type { GameState } from './types';

const RESOURCES: readonly ResourceId[] = ['gold', 'blood', 'ore', 'compromat'];

/** Возвращает список нарушений инвариантов (пустой — всё в порядке). */
export function findInvariantViolations(state: GameState): string[] {
  const errors: string[] = [];
  state.players.forEach((p, i) => {
    for (const r of RESOURCES) {
      const v = p.resources[r];
      if (!Number.isInteger(v) || v < 0) errors.push(`игрок ${i}: ресурс ${r} = ${v}`);
    }
    for (const region of REGION_ORDER) {
      const v = p.influence[region];
      if (!Number.isInteger(v) || v < 0 || v > TRACKS[region].max) {
        errors.push(`игрок ${i}: влияние ${region} = ${v}`);
      }
    }
    const count = state.workers.filter((w) => w.owner === i).length;
    if (count !== GAME.workersPerPlayer) errors.push(`игрок ${i}: рабочих ${count}`);
  });
  if (new Set(state.workers.map((w) => w.id)).size !== state.workers.length) {
    errors.push('повторяющиеся id рабочих');
  }
  for (const loc of LOCATION_ORDER) {
    // Лазутчик (этап 5) разрешит двух рабочих в первом слоте.
    if (workersAt(state, loc, 1).length > 1)
      errors.push(`${loc}: больше одного рабочего в слоте 1`);
    const slot2 = workersAt(state, loc, 2).length;
    if (slot2 > 1) errors.push(`${loc}: больше одного рабочего в слоте 2`);
    if (state.locations[loc].slot2Locked && slot2 > 0)
      errors.push(`${loc}: рабочий в закрытом слоте 2`);
  }
  if (state.lair.stash < 0) errors.push('копилка Логова отрицательна');
  if (state.round < 1 || state.round > state.config.rounds) errors.push(`раунд ${state.round}`);
  if (state.phase !== 'gameOver' && state.pending === null) errors.push('нет ожидаемого решения');
  return errors;
}

export function assertInvariants(state: GameState): void {
  const errors = findInvariantViolations(state);
  if (errors.length > 0) throw new Error(`Нарушены инварианты:\n${errors.join('\n')}`);
}
