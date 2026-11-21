import {
  CHARACTERS,
  COMBAT_TOKENS,
  COMBAT_TOKEN_ORDER,
  GAME,
  LOCATION_ORDER,
  REGION_ORDER,
  TRACKS,
  type CharacterId,
  type ResourceId,
} from '@vampire/data';
import { slotCapacity, workersAt } from './board';
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
    // Жетоны боя: каждый из набора либо в руке, либо в сбросе.
    for (const t of COMBAT_TOKEN_ORDER) {
      const { hand, discard } = p.combatTokens;
      if (hand[t] < 0 || discard[t] < 0 || hand[t] + discard[t] !== COMBAT_TOKENS[t].count) {
        errors.push(`игрок ${i}: жетонов боя ${t} в руке ${hand[t]}, в сбросе ${discard[t]}`);
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
    if (workersAt(state, loc, 1).length > slotCapacity(loc, 1))
      errors.push(`${loc}: больше одного рабочего в слоте 1`);
    const slot2 = workersAt(state, loc, 2).length;
    if (slot2 > slotCapacity(loc, 2)) errors.push(`${loc}: больше одного рабочего в слоте 2`);
    if (state.locations[loc].slot2Locked && slot2 > 0)
      errors.push(`${loc}: рабочий в закрытом слоте 2`);
  }
  if (state.combat !== null && state.phase !== 'combat') errors.push('бой идёт вне фазы боёв');
  if (state.lair.stash < 0) errors.push('копилка Логова отрицательна');

  // Персонаж и профессия у рабочего всегда вместе.
  for (const w of state.workers) {
    if ((w.character === null) !== (w.profession === null)) {
      errors.push(`${w.id}: персонаж без профессии или наоборот`);
    }
  }
  // Каждая карта персонажа ровно в одном месте: колода, сброс, драфт/Таверна, выбор игрока, рабочий.
  const cards: CharacterId[] = [
    ...state.deck,
    ...state.discard,
    ...state.offer.characters,
    ...state.players.flatMap((p) => (p.draftPick.character ? [p.draftPick.character] : [])),
    ...state.workers.flatMap((w) => (w.character ? [w.character] : [])),
  ];
  const all = Object.keys(CHARACTERS);
  if (cards.length !== all.length || new Set(cards).size !== all.length) {
    errors.push(
      `карт персонажей ${cards.length} (уникальных ${new Set(cards).size}), должно быть ${all.length}`,
    );
  }
  if (state.round < 1 || state.round > state.config.rounds) errors.push(`раунд ${state.round}`);
  if (state.phase !== 'gameOver' && state.pending === null) errors.push('нет ожидаемого решения');
  return errors;
}

export function assertInvariants(state: GameState): void {
  const errors = findInvariantViolations(state);
  if (errors.length > 0) throw new Error(`Нарушены инварианты:\n${errors.join('\n')}`);
}
