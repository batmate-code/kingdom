import { combatTokenCount } from './combat';
import { characterDeck } from './config';
import {
  BUILDING_ORDER,
  CITADELS_PER_PLAYER,
  CITADELS_PER_REGION,
  MAX_BUILDINGS_PER_TYPE,
  MONUMENTS,
  OBELISKS_PER_PLAYER,
  PLOTS,
  PRESTIGE_TRACK,
  PROFESSION_ORDER,
  SLOT_CAPACITY,
  COMBAT_TOKEN_ORDER,
  DRAFT_BY_PLAYERS,
  GAME,
  LOCATION_ORDER,
  REGION_ORDER,
  TRACKS,
  type CharacterId,
  type ResourceId,
} from '@vampire/data';
import { workersAt } from './board';
import { influenceMin, isReverse, monumentSlots } from './reverse';
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
      if (!Number.isInteger(v) || v < influenceMin(state) || v > TRACKS[region].max) {
        errors.push(`игрок ${i}: влияние ${region} = ${v}`);
      }
    }
    // Жетоны боя: каждый из набора либо в руке, либо в сбросе.
    for (const t of COMBAT_TOKEN_ORDER) {
      const { hand, discard } = p.combatTokens;
      if (
        hand[t] < 0 ||
        discard[t] < 0 ||
        hand[t] + discard[t] !== combatTokenCount(state.config.rules, t)
      ) {
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
    // В закрытый второй слот встаёт только Ночной охотник. На шаге содержания его персонажа могут
    // сбросить, а рабочий ещё стоит в слоте, поэтому на всей фазе содержания проверка не делается
    // (новых размещений там нет — ошибка движка в этой фазе сюда не попадёт).
    const lockedBy = workersAt(state, loc, 2).filter((w) => w.character !== 'nightHunter');
    if (state.locations[loc].slot2Locked && lockedBy.length > 0 && state.phase !== 'upkeep') {
      errors.push(`${loc}: рабочий в закрытом слоте 2`);
    }
  }
  // Здания: не больше 3 одного типа у игрока, одна Цитадель на регион, один дом на участок.
  state.players.forEach((p, i) => {
    if (!Number.isInteger(p.prestige) || p.prestige < 0 || p.prestige > PRESTIGE_TRACK.max) {
      errors.push(`игрок ${i}: престиж ${p.prestige}`);
    }
    for (const type of BUILDING_ORDER) {
      const n = state.buildings.filter((b) => b.owner === i && b.type === type).length;
      const limit =
        type === 'citadel'
          ? CITADELS_PER_PLAYER
          : type === 'obelisk'
            ? OBELISKS_PER_PLAYER
            : MAX_BUILDINGS_PER_TYPE;
      if (n > limit) errors.push(`игрок ${i}: зданий ${type} ${n}`);
    }
  });
  for (const region of REGION_ORDER) {
    const n = state.buildings.filter((b) => b.type === 'citadel' && b.region === region).length;
    // Обратные треки: на звезде региона до monumentSlots зданий — Шпилей и Обелисков (автор 24.11).
    const slots = isReverse(state) ? monumentSlots(state) : CITADELS_PER_REGION;
    if (n > slots) errors.push(`${region}: Цитаделей ${n}`);
    const m = state.buildings.filter((b) => MONUMENTS.includes(b.type) && b.region === region);
    if (m.length > slots) errors.push(`${region}: на звезде ${m.length} здания`);
  }
  const plots = state.buildings.flatMap((b) => (b.plot === null ? [] : [b.plot]));
  if (new Set(plots).size !== plots.length) errors.push('два здания на одном участке');
  for (const b of state.buildings) {
    const plot = b.plot === null ? null : PLOTS.find((p) => p.id === b.plot);
    if (b.plot !== null && plot?.region !== b.region)
      errors.push(`участок ${b.plot} не в ${b.region}`);
    if (MONUMENTS.includes(b.type) !== (b.plot === null))
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
  // Урезанная колода прогонов содержит копии карт — сравниваем составы целиком.
  const all = characterDeck(state.config);
  if ([...cards].sort().join() !== [...all].sort().join()) {
    errors.push(`карт персонажей ${cards.length}, должно быть ${all.length} (состав не совпадает)`);
  }
  // Драфт по числу игроков: каждый жетон профессии — в пуле, на драфте/в Таверне, у игрока или рабочего.
  if (state.config.rules.draftSize === 'players') {
    const profs = [
      ...state.professionPool,
      ...state.offer.professions,
      ...state.players.flatMap((p) => (p.draftPick.profession ? [p.draftPick.profession] : [])),
      ...state.workers.flatMap((w) => (w.profession ? [w.profession] : [])),
    ];
    for (const prof of PROFESSION_ORDER) {
      const n = profs.filter((x) => x === prof).length;
      if (n !== DRAFT_BY_PLAYERS.copiesPerProfession)
        errors.push(`жетонов профессии ${prof}: ${n}`);
    }
  }
  if (state.round < 1 || state.round > state.config.rounds) errors.push(`раунд ${state.round}`);
  if (state.phase !== 'gameOver' && state.pending === null) errors.push('нет ожидаемого решения');
  return errors;
}

export function assertInvariants(state: GameState): void {
  const errors = findInvariantViolations(state);
  if (errors.length > 0) throw new Error(`Нарушены инварианты:\n${errors.join('\n')}`);
}
