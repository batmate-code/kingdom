import type { Action, Observation } from '@vampire/core';

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
