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

/**
 * Рабочие, чей ход размещения ещё не доигран: впереди их эффект персонажа, действие локации
 * или профессия (например, Комиссар, пока размещается вернувшийся рабочий). Их нельзя вытеснить
 * (OQ-42, автор).
 */
export function busyWorkerIds(state: GameState): Set<string> {
  const ids = new Set<string>();
  for (const t of state.tasks) {
    if (t.t === 'askLocationAction') ids.add(t.context.workerId);
    else if (t.t === 'chooseEffect') {
      if (t.remaining.length > 0) ids.add(t.workerId);
    } else if (
      t.t === 'characterEffect' ||
      t.t === 'professionEffect' ||
      t.t === 'askExecutioner'
    ) {
      ids.add(t.workerId);
    } else if (t.t === 'askBuild' && t.source.kind === 'architect') ids.add(t.source.workerId);
  }
  const p = state.pending;
  if (p?.kind === 'locationAction') ids.add(p.context.workerId);
  else if (p?.kind === 'character' || p?.kind === 'executioner' || p?.kind === 'effectOrder') {
    ids.add(p.workerId);
  } else if (p?.kind === 'build' && p.source.kind === 'architect') ids.add(p.source.workerId);
  return ids;
}
