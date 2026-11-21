import { applyCombatReward } from './combat';
import type { Ctx } from './context';
import { applyDraftPick, applyUpgrade, draftOptions, upgradeOptions } from './draft';
import { applyLocationChoice, locationChoices } from './locationActions';
import { applyPass, applyPlace, placementActions } from './placement';
import { applyExecutioner, executionerTargets } from './professions';
import type { Action, Decision, GameState } from './types';
import { applyUpkeep, upkeepOptions } from './upkeep';

type DecisionOf<K extends Decision['kind']> = Extract<Decision, { kind: K }>;
type ActionOf<T extends Action['type']> = Extract<Action, { type: T }>;

/**
 * Обработчик решения: допустимые действия и их применение.
 * Новый вид решения добавляется одной записью — компилятор не даст пропустить вид.
 */
interface DecisionHandler<D extends Decision> {
  /** Принимать автоматически, если вариант всего один. */
  autoResolve: boolean;
  legal(state: GameState, decision: D): Action[];
  apply(c: Ctx, decision: D, action: Action): void;
}

function expectAction<T extends Action['type']>(action: Action, type: T): ActionOf<T> {
  if (action.type !== type) throw new Error(`Ожидалось действие ${type}, получено ${action.type}`);
  return action as ActionOf<T>;
}

const DECISIONS: { [K in Decision['kind']]: DecisionHandler<DecisionOf<K>> } = {
  placement: {
    autoResolve: false,
    legal: (state, d) => [...placementActions(state, d.player), { type: 'pass' }],
    apply(c, d, action) {
      if (action.type === 'pass') applyPass(c, d.player);
      else applyPlace(c, d.player, expectAction(action, 'place'));
    },
  },
  locationAction: {
    autoResolve: true,
    legal: (state, d) =>
      locationChoices(state, d.player, d.context).map((choice) => ({
        type: 'locationAction',
        choice,
      })),
    apply: (c, d, action) =>
      applyLocationChoice(c, d.player, d.context, expectAction(action, 'locationAction').choice),
  },
  combatReward: {
    autoResolve: true,
    legal: () => [{ type: 'combatReward', choice: 'influence' }],
    apply(c, d, action) {
      expectAction(action, 'combatReward');
      applyCombatReward(c, d.player, d.region);
    },
  },
  draftPick: {
    autoResolve: true,
    legal: (state, d) =>
      draftOptions(state, d.player, d.circle).map((pick) => ({ type: 'draftPick', pick })),
    apply: (c, d, action) => applyDraftPick(c, d.player, expectAction(action, 'draftPick').pick),
  },
  upgrade: {
    autoResolve: true,
    legal: (state, d) =>
      upgradeOptions(state, d.player).map((choice) => ({ type: 'upgrade', choice })),
    apply: (c, d, action) => applyUpgrade(c, d.player, expectAction(action, 'upgrade').choice),
  },
  upkeep: {
    autoResolve: true,
    legal: (state, d) =>
      upkeepOptions(state, d.player, d.workerId).map((choice) => ({ type: 'upkeep', choice })),
    apply: (c, d, action) =>
      applyUpkeep(c, d.player, d.workerId, expectAction(action, 'upkeep').choice),
  },
  executioner: {
    autoResolve: true,
    legal: (state, d) => [
      ...executionerTargets(state, d.player, d.workerId).map((target): Action => ({
        type: 'executioner',
        target,
      })),
      { type: 'executioner', target: null },
    ],
    apply: (c, d, action) =>
      applyExecutioner(c, d.player, expectAction(action, 'executioner').target),
  },
};

function handlerFor(decision: Decision): DecisionHandler<Decision> {
  return DECISIONS[decision.kind] as DecisionHandler<Decision>;
}

export function legalFor(state: GameState, decision: Decision): Action[] {
  return handlerFor(decision).legal(state, decision);
}

export function autoResolves(decision: Decision): boolean {
  return handlerFor(decision).autoResolve;
}

/** Выполнить решение текущего pending. Действие уже проверено на допустимость. */
export function resolve(c: Ctx, action: Action): void {
  const decision = c.draft.pending;
  if (!decision) throw new Error('Партия не ждёт решения');
  c.draft.pending = null;
  handlerFor(decision).apply(c, decision, action);
}
