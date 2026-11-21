import {
  DISPLACEMENT,
  LOCATIONS,
  LOCATION_ORDER,
  PROFESSIONS,
  SLOT_CAPACITY,
  type LocationId,
  type SlotIndex,
} from '@vampire/data';
import { busyWorkerIds, distinctWorkers, getWorker, reserveWorkers, workersAt } from './board';
import { onDisplaced, onVisit } from './buildings';
import { onCharacterDisplaced } from './characters';
import type { Ctx } from './context';
import { canAfford, changeResources, cityEntryCost, pay } from './economy';
import type { Action, EffectStep, GameState, PlayerId, Task, Worker } from './types';

// Циклический импорт placement ↔ characters безопасен: на верхнем уровне модулей нет вызовов.

type PlaceAction = Extract<Action, { type: 'place' }>;

/** Вариант размещения без типа действия (общий для хода и для Комиссара). */
export type Placement = Omit<PlaceAction, 'type'>;

function paysCityEntry(w: Worker): boolean {
  return !(w.profession !== null && PROFESSIONS[w.profession].freeCityEntry);
}

/** Может ли рабочий, вставая во второй слот, вытеснить рабочих первого слота. */
function canDisplace(
  state: GameState,
  player: PlayerId,
  worker: Worker,
  occupants: readonly Worker[],
  location: LocationId,
): boolean {
  if (occupants.length === 0) return false;
  const token = state.locations[location].professionToken;
  if (worker.profession === null || worker.profession !== token) return false;
  const busy = busyWorkerIds(state);
  return (
    occupants.every((o) => !busy.has(o.id)) &&
    occupants.every(
      (o) =>
        !(o.profession !== null && PROFESSIONS[o.profession].immuneToDisplacement) &&
        (state.config.rules.allowDisplaceOwnWorker || o.owner !== player),
    )
  );
}

export function isBlocked(state: GameState, location: LocationId): boolean {
  return state.blocks.some((b) => b.location === location);
}

/**
 * Варианты размещения рабочих `workers`. Лазутчик может встать в занятый первый слот (вторым),
 * Ночной охотник — в закрытый второй слот; локации Интригана закрыты для всех.
 * `freeEntry` — без платы за вход в Город (Комиссар).
 */
export function placementsFor(
  state: GameState,
  player: PlayerId,
  workers: readonly Worker[],
  freeEntry = false,
): Placement[] {
  const out: Placement[] = [];
  for (const worker of distinctWorkers(workers)) {
    for (const location of LOCATION_ORDER) {
      if (isBlocked(state, location)) continue;
      if (
        !freeEntry &&
        LOCATIONS[location].region === 'city' &&
        paysCityEntry(worker) &&
        !canAfford(state, player, { gold: cityEntryCost(state) })
      ) {
        continue;
      }
      const slot1 = workersAt(state, location, 1);
      const slot2 = workersAt(state, location, 2);
      const base = { workerId: worker.id, location } as const;
      const infiltrates =
        worker.character === 'infiltrator' &&
        slot1.length >= SLOT_CAPACITY.first &&
        slot1.length < SLOT_CAPACITY.firstWithInfiltrator;
      if (slot1.length < SLOT_CAPACITY.first || infiltrates) {
        out.push({ ...base, slot: 1, displace: false });
      }
      const slot2Open =
        !state.locations[location].slot2Locked || worker.character === 'nightHunter';
      if (slot2.length < SLOT_CAPACITY.second && slot2Open) {
        out.push({ ...base, slot: 2, displace: false });
        if (canDisplace(state, player, worker, slot1, location)) {
          out.push({ ...base, slot: 2, displace: true });
        }
      }
    }
  }
  return out;
}

/** Все варианты размещения для хода игрока (без паса). */
export function placementActions(state: GameState, player: PlayerId): PlaceAction[] {
  return placementsFor(state, player, reserveWorkers(state, player)).map((p) => ({
    type: 'place',
    ...p,
  }));
}

/** Вытеснить рабочего в госпиталь: компенсация владельцу и хуки (Аббатство, Доносчик, Мародёр). */
export function displaceWorker(
  c: Ctx,
  by: Worker,
  victim: Worker,
  location: LocationId,
  method: 'slot2' | 'executioner',
): void {
  victim.position = { kind: 'hospital' };
  const compensation =
    method === 'executioner' ? DISPLACEMENT.executionerCompensation : DISPLACEMENT.compensation;
  changeResources(
    c,
    victim.owner,
    { compromat: compensation },
    method === 'slot2' ? 'displaced' : 'executioner',
  );
  c.events.push({
    type: 'workerDisplaced',
    by: by.owner,
    workerId: victim.id,
    owner: victim.owner,
    location,
    method,
  });
  // OQ-33 (автор): Аббатство платит за каждого вытесненного рабочего (пара — +4).
  onDisplaced(c, location);
  onCharacterDisplaced(c, by, victim);
}

/**
 * Размещение: плата за вход в Город, вытеснение (по желанию), затем по порядку
 * эффект персонажа → действие локации → эффект профессии (OQ-21).
 * `nested` — размещение внутри чужого эффекта (Комиссар): вход бесплатный, ход не передаётся.
 */
export function applyPlace(
  c: Ctx,
  player: PlayerId,
  a: Placement,
  opts: { nested?: boolean } = {},
): void {
  const d = c.draft;
  const worker = getWorker(d, a.workerId);
  const def = LOCATIONS[a.location];

  if (!opts.nested && def.region === 'city' && paysCityEntry(worker)) {
    const gold = cityEntryCost(d);
    pay(c, player, { gold }, 'cityEntry');
    c.events.push({ type: 'cityEntryPaid', player, gold });
  }
  // Копилка Логова не растёт, если кто-то занял его второй слот (ответ автора, 22.11).
  if (a.location === 'lair' && a.slot === 2) d.lair.slot2Taken = true;

  let actionSlot: SlotIndex = a.slot;
  if (a.displace) {
    for (const victim of workersAt(d, a.location, 1)) {
      displaceWorker(c, worker, victim, a.location, 'slot2');
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

  // Палач — только при размещении прямо в первый слот; переход туда вытеснением — OQ-16.
  const directSlot1 = a.slot === 1 || (a.displace && d.config.rules.executionerOnDisplacement);
  const context = { workerId: worker.id, location: a.location, slot: actionSlot, copy: false };
  const steps: Task[] =
    d.config.rules.effectOrder === 'free'
      ? [
          {
            t: 'chooseEffect',
            player,
            workerId: worker.id,
            remaining: effectSteps(worker, directSlot1),
            context,
            directSlot1,
            character: worker.character,
          },
        ]
      : [
          { t: 'characterEffect', player, workerId: worker.id },
          { t: 'askLocationAction', player, context },
          { t: 'professionEffect', player, workerId: worker.id, directSlot1 },
        ];
  d.tasks.unshift(
    ...steps,
    ...(opts.nested ? [] : [{ t: 'placementTurn' as const, first: false }]),
  );
}

/**
 * Эффекты, из которых выбирают при свободном порядке. Персонаж и профессия без эффекта
 * в выбор не попадают, чтобы не плодить пустые решения.
 */
function effectSteps(worker: Worker, directSlot1: boolean): EffectStep[] {
  const steps: EffectStep[] = [];
  if (worker.character !== null) steps.push('character');
  steps.push('location');
  if (
    worker.profession === 'architect' ||
    (worker.profession === 'executioner' && directSlot1) ||
    // Лицемер может сменить себе профессию на Архитектора или Палача.
    worker.character === 'hypocrite'
  ) {
    steps.push('profession');
  }
  return steps;
}

/** Свободный порядок: варианты следующего эффекта (единственный разыгрывается сам). */
export function effectOrderOptions(state: GameState, workerId: string): EffectStep[] {
  const task = state.tasks.find((t) => t.t === 'chooseEffect' && t.workerId === workerId);
  return task?.t === 'chooseEffect' ? task.remaining : [];
}

/** Шаг свободного порядка: спросить игрока или, если эффект один, сразу его разыграть. */
export function chooseEffect(c: Ctx, task: Extract<Task, { t: 'chooseEffect' }>): void {
  if (task.remaining.length === 0) return;
  // Решение ссылается на задачу, поэтому она возвращается в очередь до выбора.
  c.draft.tasks.unshift(task);
  if (task.remaining.length === 1) {
    applyEffectOrder(c, task.workerId, task.remaining[0] as EffectStep);
    return;
  }
  c.draft.pending = { kind: 'effectOrder', player: task.player, workerId: task.workerId };
}

/** Разыграть выбранный эффект; остальные остаются в выборе. */
export function applyEffectOrder(c: Ctx, workerId: string, step: EffectStep): void {
  const d = c.draft;
  const i = d.tasks.findIndex((t) => t.t === 'chooseEffect' && t.workerId === workerId);
  const task = d.tasks[i];
  if (!task || task.t !== 'chooseEffect' || !task.remaining.includes(step)) {
    throw new Error(`Эффект ${step} рабочего ${workerId} уже разыгран`);
  }
  const rest = { ...task, remaining: task.remaining.filter((s) => s !== step) };
  const worker = getWorker(d, workerId);
  const now: Task[] = [];
  if (step === 'character') {
    // Персонаж сменился (Таверна) — новый в этом размещении не срабатывает.
    if (worker.character === task.character) {
      now.push({ t: 'characterEffect', player: task.player, workerId });
    }
  } else if (step === 'location') {
    now.push({ t: 'askLocationAction', player: task.player, context: task.context });
  } else {
    now.push({
      t: 'professionEffect',
      player: task.player,
      workerId,
      directSlot1: task.directSlot1,
    });
  }
  d.tasks.splice(i, 1, ...now, rest);
}

/**
 * Эффект профессии после действия локации. Профессию берём на этот момент (Лицемер мог её сменить).
 * Палач — при размещении в первый слот; Архитектор — в любом слоте (OQ-30).
 */
export function professionEffect(
  c: Ctx,
  player: PlayerId,
  workerId: string,
  directSlot1: boolean,
): void {
  const worker = getWorker(c.draft, workerId);
  if (worker.position.kind !== 'slot') return;
  if (worker.profession === 'executioner' && directSlot1) {
    c.draft.tasks.unshift({ t: 'askExecutioner', player, workerId });
  } else if (worker.profession === 'architect') {
    c.draft.tasks.unshift({ t: 'askBuild', player, source: { kind: 'architect', workerId } });
  }
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
