import { CHARACTERS, HOSPITAL } from '@vampire/data';
import { getWorker } from './board';
import type { Ctx } from './context';
import { discardPair, turnOrder } from './draft';
import { changeResources } from './economy';
import type { GameState, PlayerId, Task, Worker } from './types';

/**
 * Содержание персонажа: кровь по карте, −1 если рабочий в госпитале, не ниже 0.
 * Скидка Цитадели Долины добавится на этапе 4.
 */
export function upkeepCost(_state: GameState, worker: Worker): number {
  if (worker.character === null) return 0;
  let cost = CHARACTERS[worker.character].upkeep;
  if (worker.position.kind === 'hospital') cost -= HOSPITAL.upkeepDiscount;
  return Math.max(0, cost);
}

/**
 * Конец раунда, часть 1. Содержание платится, пока рабочие ещё стоят на поле и в госпитале
 * (от этого зависит скидка). Решают по очереди с первого игрока, по каждому улучшенному рабочему.
 */
export function startUpkeep(c: Ctx): void {
  const d = c.draft;
  d.phase = 'upkeep';
  const tasks: Task[] = [];
  for (const player of turnOrder(d)) {
    for (const w of d.workers) {
      if (w.owner === player && w.character !== null) {
        tasks.push({ t: 'askUpkeep', player, workerId: w.id });
      }
    }
  }
  d.tasks.unshift(...tasks, { t: 'finishRound' });
}

export function upkeepOptions(
  state: GameState,
  player: PlayerId,
  workerId: string,
): ('pay' | 'discard')[] {
  const worker = getWorker(state, workerId);
  const blood = state.players[player]?.resources.blood ?? 0;
  return blood >= upkeepCost(state, worker) ? ['pay', 'discard'] : ['discard'];
}

/** Оплатить содержание или сбросить пару за отступные (рабочий возвращается без улучшения). */
export function applyUpkeep(
  c: Ctx,
  player: PlayerId,
  workerId: string,
  choice: 'pay' | 'discard',
): void {
  const worker = c.draft.workers.find((w) => w.id === workerId);
  if (!worker || worker.character === null || worker.profession === null) {
    throw new Error(`У рабочего ${workerId} нет улучшения`);
  }
  if (choice === 'pay') {
    const blood = upkeepCost(c.draft, worker);
    changeResources(c, player, { blood: -blood }, 'upkeep');
    c.events.push({ type: 'upkeepPaid', player, workerId, blood });
    return;
  }
  discardPair(c, player, worker.character, worker.profession, 'upkeep');
  worker.character = null;
  worker.profession = null;
}
