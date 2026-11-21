import { LOCATIONS, type LocationId, type RegionId, type SlotIndex } from '@vampire/data';
import type { GameState, PlayerId, Worker } from './types';

export function workersAt(state: GameState, location: LocationId, slot: SlotIndex): Worker[] {
  return state.workers.filter(
    (w) =>
      w.position.kind === 'slot' && w.position.location === location && w.position.slot === slot,
  );
}

export function regionOfWorker(w: Worker): RegionId | null {
  const pos = w.position;
  if (pos.kind === 'slot') return LOCATIONS[pos.location].region;
  if (pos.kind === 'citadelSpot') return pos.region;
  return null;
}

/** Рабочий считается в бою региона: стоит в первом слоте локации региона или у места Цитадели. */
export function countsInCombat(w: Worker, region: RegionId): boolean {
  const pos = w.position;
  if (pos.kind === 'slot') return pos.slot === 1 && LOCATIONS[pos.location].region === region;
  return pos.kind === 'citadelSpot' && pos.region === region;
}

export function reserveWorkers(state: GameState, player: PlayerId): Worker[] {
  return state.workers.filter((w) => w.owner === player && w.position.kind === 'reserve');
}

export function getWorker(state: GameState, id: string): Worker {
  const w = state.workers.find((x) => x.id === id);
  if (!w) throw new Error(`Нет рабочего ${id}`);
  return w;
}

/**
 * Одинаковые рабочие (та же профессия и персонаж) взаимозаменяемы — в списке действий
 * оставляем по одному представителю, чтобы не плодить равные варианты.
 */
export function distinctWorkers(workers: readonly Worker[]): Worker[] {
  const seen = new Set<string>();
  const out: Worker[] = [];
  for (const w of workers) {
    const key = `${w.profession ?? '-'}|${w.character ?? '-'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}
