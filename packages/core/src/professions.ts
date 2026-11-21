import { DISPLACEMENT, LOCATIONS, PROFESSIONS } from '@vampire/data';
import { getWorker } from './board';
import type { Ctx } from './context';
import { changeResources } from './economy';
import type { GameState, PlayerId } from './types';

/**
 * Палач: при размещении в первый слот может вытеснить чужого рабочего из другой локации
 * того же региона; совпадение профессии не нужно, Стража вытеснить нельзя.
 * Цели — рабочие первых слотов (OQ-15: вторые слоты — переключатель).
 */
export function executionerTargets(state: GameState, player: PlayerId, workerId: string): string[] {
  const self = getWorker(state, workerId);
  if (self.position.kind !== 'slot') return [];
  const here = self.position.location;
  const region = LOCATIONS[here].region;
  const allowSlot2 = state.config.rules.executionerTargetsSecondSlot;
  return state.workers
    .filter((w) => {
      if (w.owner === player || w.position.kind !== 'slot') return false;
      if (w.position.location === here || LOCATIONS[w.position.location].region !== region) {
        return false;
      }
      if (w.position.slot === 2 && !allowSlot2) return false;
      return !(w.profession !== null && PROFESSIONS[w.profession].immuneToDisplacement);
    })
    .map((w) => w.id);
}

export function applyExecutioner(c: Ctx, player: PlayerId, target: string | null): void {
  if (target === null) return;
  const victim = c.draft.workers.find((w) => w.id === target);
  if (!victim || victim.position.kind !== 'slot') throw new Error(`Нельзя вытеснить ${target}`);
  const location = victim.position.location;
  victim.position = { kind: 'hospital' };
  // Владелец вытесненного получает 2 компромата, Палач — ничего. Замок не ставится.
  changeResources(
    c,
    victim.owner,
    { compromat: DISPLACEMENT.executionerCompensation },
    'executioner',
  );
  c.events.push({
    type: 'workerDisplaced',
    by: player,
    workerId: victim.id,
    owner: victim.owner,
    location,
    method: 'executioner',
  });
}
