import { nextRandom, type Action } from '@vampire/core';
import type { Bot } from './index';

/** Генератор бота: своё состояние, свой seed — партию можно воспроизвести. */
class BotRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Целое от 0 до n−1. */
  int(n: number): number {
    const [value, next] = nextRandom(this.state);
    this.state = next;
    return Math.floor(value * n);
  }

  pick<T>(items: readonly T[]): T {
    const item = items[this.int(items.length)];
    if (item === undefined) throw new Error('Выбор из пустого списка');
    return item;
  }
}

/**
 * Пас запрещён, пока есть хоть одно размещение: ранний пас случайного бота искажает статистику
 * (решение автора). Если выставить рабочего некуда, пас остаётся единственным ходом.
 */
export function withoutEarlyPass(legal: readonly Action[]): readonly Action[] {
  return legal.some((a) => a.type === 'place') ? legal.filter((a) => a.type !== 'pass') : legal;
}

/** Случайный бот A: равновероятно среди всех допустимых ходов (стресс-тест движка). */
export function createRandomBot(seed: number): Bot {
  const rng = new BotRng(seed);
  return {
    name: 'random',
    chooseAction: (_observation, legal) => rng.pick(withoutEarlyPass(legal)),
  };
}

/**
 * Ключ хода по ступеням: сначала равновероятно выбирается первая ступень, среди подходящих —
 * вторая и так далее. Так число вариантов внутри одной группы не перевешивает другие группы
 * (15 комбинаций Канцелярии против «пропустить», двойные варианты Алхимика).
 */
export function actionPath(a: Action): string[] {
  switch (a.type) {
    case 'place':
      return ['place', a.location, `${a.slot}${a.displace ? '+' : ''}`, a.workerId];
    case 'locationAction': {
      const c = a.choice;
      if (c.kind === 'skip') return ['skip'];
      return ['do', c.kind, JSON.stringify(c)];
    }
    case 'build':
      if (!a.choice) return ['skip'];
      return ['build', a.choice.building, a.choice.region, JSON.stringify(a.choice)];
    case 'character':
      return [a.choice.kind, JSON.stringify(a.choice)];
    case 'draftPick':
      return [a.pick.kind, JSON.stringify(a.pick)];
    case 'upgrade':
      return [a.choice.kind, JSON.stringify(a.choice)];
    default:
      return [JSON.stringify(a)];
  }
}

/** Выбрать ход по ступеням ключа. */
export function pickByPath(legal: readonly Action[], pick: <T>(items: readonly T[]) => T): Action {
  let candidates = legal.map((action) => ({ action, path: actionPath(action) }));
  for (let level = 0; candidates.length > 1; level++) {
    const keys = [...new Set(candidates.map((c) => c.path[level] ?? ''))];
    if (keys.length === 1 && candidates.every((c) => c.path.length <= level)) break;
    const key = pick(keys);
    candidates = candidates.filter((c) => (c.path[level] ?? '') === key);
  }
  const chosen = candidates[0];
  if (!chosen) throw new Error('Нет допустимых действий');
  return chosen.action;
}

/** Случайный бот B: равновероятно по ступеням (база для статистики). */
export function createGroupedRandomBot(seed: number): Bot {
  const rng = new BotRng(seed);
  return {
    name: 'random-grouped',
    chooseAction: (_observation, legal) =>
      pickByPath(withoutEarlyPass(legal), (items) => rng.pick(items)),
  };
}
