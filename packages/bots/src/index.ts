import type { Action, Observation } from '@vampire/core';
import { createHeuristicBot } from './heuristic';
import { WEIGHTS_V1, WEIGHTS_V2, WEIGHTS_V3 } from './heuristic/weights';
import { createGroupedRandomBot, createRandomBot } from './random';

/** Бот выбирает одно из допустимых действий по тому, что видит его игрок. */
export interface Bot {
  readonly name: string;
  chooseAction(observation: Observation, legal: readonly Action[]): Action;
}

/** Простейший детерминированный бот: всегда первое допустимое действие. Для тестов и отладки. */
export const firstLegalBot: Bot = {
  name: 'first-legal',
  chooseAction(_observation, legal) {
    const action = legal[0];
    if (!action) throw new Error('Нет допустимых действий');
    return action;
  },
};

export { createHeuristicBot } from './heuristic';
export { evaluate, playerValue } from './heuristic/evaluate';
export {
  actionPath,
  createGroupedRandomBot,
  createRandomBot,
  pickByPath,
  withoutEarlyPass,
} from './random';

/** Боты по имени — для симулятора и интерфейса. Каждому креслу свой seed. */
export const BOT_FACTORIES: Readonly<Record<string, (seed: number) => Bot>> = {
  'first-legal': () => firstLegalBot,
  random: (seed) => createRandomBot(seed),
  'random-grouped': (seed) => createGroupedRandomBot(seed),
  heuristic: (seed) => createHeuristicBot(seed),
  'heuristic-v1': (seed) => createHeuristicBot(seed, WEIGHTS_V1, 'heuristic-v1'),
  'heuristic-v2': (seed) => createHeuristicBot(seed, WEIGHTS_V2, 'heuristic-v2'),
  'heuristic-v3': (seed) => createHeuristicBot(seed, WEIGHTS_V3, 'heuristic-v3'),
};
