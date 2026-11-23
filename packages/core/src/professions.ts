import { DISPLACEMENT, LOCATIONS, PROFESSIONS } from '@vampire/data';
import { busyWorkerIds, getWorker, workersAt } from './board';
import type { Ctx } from './context';
import { changeResources } from './economy';
import { displaceWorker } from './placement';
import type { GameState, PlayerId, Worker } from './types';

/**
 * Палач: при размещении в первый слот может вытеснить чужого рабочего из другой локации
 * того же региона; совпадение профессии не нужно, Стража вытеснить нельзя.
 * Цели — рабочие первых слотов (OQ-15: вторые слоты — переключатель).
 */
function isGuard(w: Worker): boolean {
  return w.profession !== null && PROFESSIONS[w.profession].immuneToDisplacement;
}

export function executionerTargets(state: GameState, player: PlayerId, workerId: string): string[] {
  const self = getWorker(state, workerId);
  if (self.position.kind !== 'slot') return [];
  const here = self.position.location;
  const region = LOCATIONS[here].region;
  const allowSlot2 = state.config.rules.executionerTargetsSecondSlot;
  const busy = busyWorkerIds(state);
  return state.workers
    .filter((w) => {
      if (w.owner === player || w.position.kind !== 'slot') return false;
      if (w.position.location === here || LOCATIONS[w.position.location].region !== region) {
        return false;
      }
      if (w.position.slot === 2 && !allowSlot2) return false;
      // Пару вытесняют вместе — недоигравший свой ход рабочий в паре защищает обоих (OQ-42).
      const slotmates = workersAt(state, w.position.location, w.position.slot);
      return !isGuard(w) && slotmates.every((o) => isGuard(o) || !busy.has(o.id));
    })
    .map((w) => w.id);
}

/**
 * Вытеснение Палачом: владелец получает 2 компромата, Палач — ничего, замок не ставится.
 * Если цель стоит в первом слоте вместе с Лазутчиком, выбиваются оба, кроме Стража (OQ-34).
 */
export function applyExecutioner(
  c: Ctx,
  player: PlayerId,
  workerId: string,
  target: string | null,
): void {
  if (target === null) return;
  const victim = c.draft.workers.find((w) => w.id === target);
  if (!victim || victim.position.kind !== 'slot') throw new Error(`Нельзя вытеснить ${target}`);
  const { location, slot } = victim.position;
  const by = getWorker(c.draft, workerId);
  if (by.owner !== player) throw new Error(`Палач ${workerId} не принадлежит игроку ${player}`);
  // Пара с Лазутчиком вылетает вместе, но Страж защищает только себя (OQ-34, автор).
  let displaced = false;
  for (const w of workersAt(c.draft, location, slot)) {
    if (isGuard(w)) continue;
    displaceWorker(c, by, w, location, 'executioner');
    displaced = true;
  }
  // Автор 23.11: Палач сам получает компромат за вытеснение.
  if (displaced) {
    changeResources(c, player, { compromat: DISPLACEMENT.executionerReward }, 'executioner');
  }
}
