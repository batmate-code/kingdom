import {
  DISPLACEMENT,
  LOCATIONS,
  LOCATION_ORDER,
  PROFESSIONS,
  type SlotIndex,
} from '@vampire/data';
import { distinctWorkers, getWorker, reserveWorkers, slotCapacity, workersAt } from './board';
import { onDisplaced, onVisit } from './buildings';
import type { Ctx } from './context';
import { canAfford, changeResources, cityEntryCost, pay } from './economy';
import type { Action, GameState, PlayerId, Worker } from './types';

type PlaceAction = Extract<Action, { type: 'place' }>;

function paysCityEntry(w: Worker): boolean {
  return !(w.profession !== null && PROFESSIONS[w.profession].freeCityEntry);
}

/** Может ли рабочий, вставая во второй слот, вытеснить рабочих первого слота. */
function canDisplace(
  state: GameState,
  player: PlayerId,
  worker: Worker,
  occupants: readonly Worker[],
  location: (typeof LOCATION_ORDER)[number],
): boolean {
  if (occupants.length === 0) return false;
  const token = state.locations[location].professionToken;
  if (worker.profession === null || worker.profession !== token) return false;
  return occupants.every(
    (o) =>
      !(o.profession !== null && PROFESSIONS[o.profession].immuneToDisplacement) &&
      (state.config.rules.allowDisplaceOwnWorker || o.owner !== player),
  );
}

/** Все варианты размещения для игрока (без паса). */
export function placementActions(state: GameState, player: PlayerId): PlaceAction[] {
  const out: PlaceAction[] = [];
  for (const worker of distinctWorkers(reserveWorkers(state, player))) {
    for (const location of LOCATION_ORDER) {
      const def = LOCATIONS[location];
      if (
        def.region === 'city' &&
        paysCityEntry(worker) &&
        !canAfford(state, player, { gold: cityEntryCost(state) })
      ) {
        continue;
      }
      const slot1 = workersAt(state, location, 1);
      const slot2 = workersAt(state, location, 2);
      const base = { type: 'place', workerId: worker.id, location } as const;
      if (slot1.length < slotCapacity(location, 1)) out.push({ ...base, slot: 1, displace: false });
      if (slot2.length < slotCapacity(location, 2) && !state.locations[location].slot2Locked) {
        out.push({ ...base, slot: 2, displace: false });
        if (canDisplace(state, player, worker, slot1, location)) {
          out.push({ ...base, slot: 2, displace: true });
        }
      }
    }
  }
  return out;
}

/**
 * Размещение: плата за вход в Город, вытеснение (по желанию), затем действие слота.
 * Порядок по правилам: эффект персонажа (этап 5) → действие локации.
 */
export function applyPlace(c: Ctx, player: PlayerId, a: PlaceAction): void {
  const d = c.draft;
  const worker = getWorker(d, a.workerId);
  const def = LOCATIONS[a.location];

  if (def.region === 'city' && paysCityEntry(worker)) {
    const gold = cityEntryCost(d);
    pay(c, player, { gold }, 'cityEntry');
    c.events.push({ type: 'cityEntryPaid', player, gold });
  }
  if (a.location === 'lair') d.lair.visited = true;

  let actionSlot: SlotIndex = a.slot;
  if (a.displace) {
    for (const victim of workersAt(d, a.location, 1)) {
      victim.position = { kind: 'hospital' };
      changeResources(c, victim.owner, { compromat: DISPLACEMENT.compensation }, 'displaced');
      c.events.push({
        type: 'workerDisplaced',
        by: player,
        workerId: victim.id,
        owner: victim.owner,
        location: a.location,
        method: 'slot2',
      });
      // OQ-33 (автор): Аббатство платит за каждого вытесненного рабочего (пара — +4).
      onDisplaced(c, a.location);
    }
    // Вытесняющий выполняет действие второго слота, но встаёт в первый; второй слот закрывается.
    worker.position = { kind: 'slot', location: a.location, slot: 1 };
    d.locations[a.location].slot2Locked = true;
    actionSlot = 2;
  } else {
    worker.position = { kind: 'slot', location: a.location, slot: a.slot };
  }
  c.events.push({
    type: 'workerPlaced',
    player,
    workerId: worker.id,
    location: a.location,
    slot: worker.position.kind === 'slot' ? worker.position.slot : a.slot,
  });
  onVisit(c, player, a.location);

  // Палач срабатывает при размещении в первый слот; переход туда вытеснением — OQ-16.
  // OQ-21 (автор): способности при выставлении идут по порядку персонаж → локация → профессия,
  // поэтому Палач вытесняет после действия локации.
  const executioner =
    worker.profession === 'executioner' &&
    (a.slot === 1 || (a.displace && d.config.rules.executionerOnDisplacement))
      ? [{ t: 'askExecutioner' as const, player, workerId: worker.id }]
      : [];
  // Архитектор: при размещении (в любой слот) может построить рядом со своей локацией.
  const architect =
    worker.profession === 'architect'
      ? [
          {
            t: 'askBuild' as const,
            player,
            source: { kind: 'architect' as const, workerId: worker.id },
          },
        ]
      : [];
  d.tasks.unshift(
    {
      t: 'askLocationAction',
      player,
      context: { workerId: worker.id, location: a.location, slot: actionSlot, copy: false },
    },
    ...executioner,
    ...architect,
    { t: 'placementTurn', first: false },
  );
}

export function applyPass(c: Ctx, player: PlayerId): void {
  const p = c.draft.players[player];
  if (!p) throw new Error(`Нет игрока ${player}`);
  p.passed = true;
  c.events.push({ type: 'passed', player });
  c.draft.tasks.unshift({ t: 'placementTurn', first: false });
}

/** Игрок ещё участвует в размещении: не спасовал и есть рабочие в запасе. */
export function canTakePlacementTurn(state: GameState, player: PlayerId): boolean {
  const p = state.players[player];
  return !!p && !p.passed && reserveWorkers(state, player).length > 0;
}
