import {
  applyAction,
  determinize,
  getLegalActions,
  nextRandom,
  type Action,
  type Decision,
  type GameState,
  type Observation,
  type PlayerId,
} from '@vampire/core';
import type { Bot } from '../index';
import { evaluate } from './evaluate';
import { SEARCH, WEIGHTS, type Weights } from './weights';

/** Решения, где скрытое (жетоны боя соперников) влияет на исход: оцениваем по нескольким раскладкам. */
const HIDDEN_SENSITIVE: ReadonlySet<Decision['kind']> = new Set([
  'combatToken',
  'retreat',
  'spyMove',
]);

/** Решения соперников внутри боя, которые доигрываются случайно при примерке хода. */
const OPPONENT_COMBAT: ReadonlySet<Decision['kind']> = new Set([
  'combatToken',
  'retreat',
  'spyMove',
  'combatReward',
]);

/** Свои решения, которые не продолжают цепочку текущего хода (это уже новый ход). */
const NEW_TURN: ReadonlySet<Decision['kind']> = new Set([
  'placement',
  'draftPick',
  'upgrade',
  'upkeep',
]);

class Rng {
  constructor(private state: number) {}
  int(n: number): number {
    const [v, next] = nextRandom(this.state);
    this.state = next;
    return Math.floor(v * n);
  }
}

function apply(state: GameState, action: Action): GameState {
  return applyAction(state, action, { validate: false }).state;
}

/** Лучший ход для игрока по оценке после одного шага (жадно). */
function greedy(state: GameState, me: PlayerId, legal: readonly Action[], w: Weights): Action {
  let best = legal[0] as Action;
  let bestScore = -Infinity;
  for (const a of legal) {
    const score = evaluate(apply(state, a), me, w);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

/**
 * Доиграть последствия хода: свою цепочку (действие локации, стройка, эффект персонажа) —
 * жадно, решения соперников в бою — случайно. Останавливается на новом ходе или конце боя.
 */
function settle(state: GameState, me: PlayerId, rng: Rng, w: Weights): GameState {
  let s = state;
  for (let step = 0; step < SEARCH.maxChainSteps && s.pending; step++) {
    const p = s.pending;
    const legal = getLegalActions(s);
    if (legal.length === 0) break;
    if (p.player === me && !NEW_TURN.has(p.kind)) {
      s = apply(s, legal.length === 1 ? (legal[0] as Action) : greedy(s, me, legal, w));
    } else if (p.player !== me && OPPONENT_COMBAT.has(p.kind)) {
      s = apply(s, legal[rng.int(legal.length)] as Action);
    } else {
      break;
    }
  }
  return s;
}

/**
 * Эвристический бот: для каждого допустимого хода примеряет его на правдоподобном полном
 * состоянии, доигрывает свою цепочку и оценивает позицию (evaluate). Там, где важна скрытая
 * информация, оценка усредняется по нескольким раскладкам.
 */
export function createHeuristicBot(seed: number, w: Weights = WEIGHTS, name = 'heuristic'): Bot {
  const rng = new Rng(seed | 0);
  return {
    name,
    chooseAction(obs: Observation, legal: readonly Action[]): Action {
      if (legal.length === 1) return legal[0] as Action;
      const me = obs.viewer;
      const kind = obs.pending?.kind;
      const samples =
        kind && HIDDEN_SENSITIVE.has(kind) ? SEARCH.samplesHidden : SEARCH.samplesPlain;
      const totals = legal.map(() => 0);
      for (let k = 0; k < samples; k++) {
        const base = determinize(obs, rng.int(2 ** 31));
        legal.forEach((a, i) => {
          totals[i] = (totals[i] ?? 0) + evaluate(settle(apply(base, a), me, rng, w), me, w);
        });
      }
      let best = 0;
      totals.forEach((t, i) => {
        if (t > (totals[best] ?? -Infinity)) best = i;
      });
      return legal[best] as Action;
    },
  };
}
