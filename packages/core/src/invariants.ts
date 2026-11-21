import {
  BUILDING_ORDER,
  CHARACTERS,
  CITADELS_PER_PLAYER,
  CITADELS_PER_REGION,
  MAX_BUILDINGS_PER_TYPE,
  PLOTS,
  PRESTIGE_TRACK,
  SLOT_CAPACITY,
  COMBAT_TOKENS,
  COMBAT_TOKEN_ORDER,
  GAME,
  LOCATION_ORDER,
  REGION_ORDER,
  TRACKS,
  type CharacterId,
  type ResourceId,
} from '@vampire/data';
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
    // Второй рабочий в первом слоте возможен только через Лазутчика (его персонажа потом могут
    // сбросить на содержании или заменить — пара остаётся).
    if (workersAt(state, loc, 1).length > SLOT_CAPACITY.firstWithInfiltrator) {
      errors.push(`${loc}: лишний рабочий в слоте 1`);
    }
    const slot2 = workersAt(state, loc, 2).length;
    if (slot2 > SLOT_CAPACITY.second) errors.push(`${loc}: больше одного рабочего в слоте 2`);
    // Ночной охотник может стоять в закрытом втором слоте.
    const lockedBy = workersAt(state, loc, 2).filter((w) => w.character !== 'nightHunter');
    if (state.locations[loc].slot2Locked && lockedBy.length > 0)
      errors.push(`${loc}: рабочий в закрытом слоте 2`);
  }
  // Здания: не больше 3 одного типа у игрока, одна Цитадель на регион, один дом на участок.
  state.players.forEach((p, i) => {
    if (!Number.isInteger(p.prestige) || p.prestige < 0 || p.prestige > PRESTIGE_TRACK.max) {
      errors.push(`игрок ${i}: престиж ${p.prestige}`);
    }
    for (const type of BUILDING_ORDER) {
      const n = state.buildings.filter((b) => b.owner === i && b.type === type).length;
      const limit = type === 'citadel' ? CITADELS_PER_PLAYER : MAX_BUILDINGS_PER_TYPE;
      if (n > limit) errors.push(`игрок ${i}: зданий ${type} ${n}`);
    }
  });
  for (const region of REGION_ORDER) {
    const n = state.buildings.filter((b) => b.type === 'citadel' && b.region === region).length;
    if (n > CITADELS_PER_REGION) errors.push(`${region}: Цитаделей ${n}`);
  }
  const plots = state.buildings.flatMap((b) => (b.plot === null ? [] : [b.plot]));
  if (new Set(plots).size !== plots.length) errors.push('два здания на одном участке');
  for (const b of state.buildings) {
    const plot = b.plot === null ? null : PLOTS.find((p) => p.id === b.plot);
    if (b.plot !== null && plot?.region !== b.region)
      errors.push(`участок ${b.plot} не в ${b.region}`);
    if ((b.type === 'citadel') !== (b.plot === null))
      errors.push(`здание ${b.type} не на своём месте`);
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
