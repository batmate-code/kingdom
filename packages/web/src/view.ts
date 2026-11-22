import {
  actionLabel,
  combatStrengths,
  getLegalActions,
  getObservation,
  type Action,
  type GameState,
  type Observation,
  type Worker,
} from '@vampire/core';
import { REGION_ORDER } from '@vampire/data';
import { effectText, previewEffect } from './ActionBar';
import type { BoardStrengths } from './board/BoardSvg';

/**
 * Что показывает экран партии в данный момент — чистые функции от состояния. Ими пользуются
 * и компонент игры, и прогон интерфейса случайными ботами (uiStress.test.tsx).
 */

type PlaceAction = Extract<Action, { type: 'place' }>;

/** Ключ «одинаковых» рабочих: ядро предлагает ход только для одного из них. */
export const pairKey = (w: Worker) => `${w.owner}|${w.profession ?? '-'}|${w.character ?? '-'}`;

function groupBy(actions: Action[], key: (a: Action) => string | null): Record<string, Action[]> {
  const out: Record<string, Action[]> = {};
  for (const a of actions) {
    const k = key(a);
    if (k !== null) (out[k] ??= []).push(a);
  }
  return out;
}

export interface ScreenView {
  /** Чьими глазами смотрим: ходящий человек или первый человек за столом. */
  viewer: number;
  obs: Observation;
  botTurn: boolean;
  /** Допустимые ходы человека (пусто, когда ходит бот). */
  legal: Action[];
  /** Цели на поле: гнёзда (`локация:слот`) и участки (id или `citadel:регион`). */
  slots: Record<string, Action[]>;
  plots: Record<string, Action[]>;
  /** Варианты в строке решения: всё, что не выбирается на поле и в окнах (или варианты одной цели). */
  barLegal: Action[];
  strengths: BoardStrengths | undefined;
  drafting: boolean;
  human: boolean;
}

export function screenView(
  state: GameState,
  seats: readonly string[],
  selected: string | null,
  focus: Action[] | null,
): ScreenView {
  const pending = state.pending;
  const botTurn = pending !== null && seats[pending.player] !== 'human';
  const viewer = pending && !botTurn ? pending.player : Math.max(0, seats.indexOf('human'));
  const obs = getObservation(state, viewer);
  const legal = pending && !botTurn ? getLegalActions(state) : [];

  // Размещение — выбранным рабочим (или любым), стройка — на участках и местах Цитаделей.
  const placements = legal.filter((a): a is PlaceAction => a.type === 'place');
  const selectedWorker = obs.workers.find((w) => w.id === selected);
  const actingId = selectedWorker
    ? placements.find((a) => {
        const w = obs.workers.find((x) => x.id === a.workerId);
        return w && pairKey(w) === pairKey(selectedWorker);
      })?.workerId
    : undefined;
  const usable = selectedWorker ? placements.filter((a) => a.workerId === actingId) : placements;
  const slots = groupBy(usable, (a) => (a.type === 'place' ? `${a.location}:${a.slot}` : null));
  const plots = groupBy(legal, (a) =>
    a.type === 'build' && a.choice ? (a.choice.plot ?? `citadel:${a.choice.region}`) : null,
  );

  const strengths: BoardStrengths | undefined =
    state.phase === 'placement' || state.phase === 'combat'
      ? Object.fromEntries(
          REGION_ORDER.map((r) => [
            r,
            combatStrengths(state, r).map((x) => ({ player: x.player, strength: x.strength })),
          ]),
        )
      : undefined;

  const barLegal =
    focus ??
    legal.filter(
      (a) =>
        a.type !== 'place' &&
        a.type !== 'draftPick' &&
        a.type !== 'combatToken' &&
        !(a.type === 'build' && a.choice),
    );

  return {
    viewer,
    obs,
    botTurn,
    legal,
    slots,
    plots,
    barLegal,
    strengths,
    drafting: obs.phase === 'draft' || obs.phase === 'upgrade',
    human: seats[viewer] === 'human',
  };
}

/** Подсказка цели на поле: подпись хода и его итог. */
export function targetHint(state: GameState, viewer: number, actions: Action[]): string {
  return actions
    .map((a) => {
      const e = effectText(previewEffect(state, a, viewer));
      return `${actionLabel(state, a)}${e ? ` — ${e}` : ''}`;
    })
    .join('\n');
}
