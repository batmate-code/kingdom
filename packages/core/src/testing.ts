/** Помощники для тестов ядра. В публичный API не входят. */
import type { LocationId, Resources, SlotIndex } from '@vampire/data';
import { produce } from 'immer';
import type { GameConfigInput } from './config';
import { applyAction, createGame, getLegalActions } from './engine';
import type { Action, GameEvent, GameState, LocationChoice, PlayerId, Position } from './types';

export function newGame(config: GameConfigInput = {}, seed = 1): GameState {
  return createGame(config, seed);
}

/** Произвольно поправить состояние для подготовки сценария. */
export function edit(state: GameState, recipe: (d: GameState) => void): GameState {
  return produce(state, recipe);
}

/** Отдать ход размещения игроку. */
export function turnTo(state: GameState, player: PlayerId): GameState {
  return edit(state, (d) => {
    d.placementCurrent = player;
    d.pending = { kind: 'placement', player };
  });
}

export function setResources(
  state: GameState,
  player: PlayerId,
  res: Partial<Resources>,
): GameState {
  return edit(state, (d) => {
    Object.assign((d.players[player] as GameState['players'][number]).resources, res);
  });
}

export function moveWorker(state: GameState, workerId: string, position: Position): GameState {
  return edit(state, (d) => {
    const w = d.workers.find((x) => x.id === workerId);
    if (!w) throw new Error(`Нет рабочего ${workerId}`);
    w.position = position;
  });
}

export function setWorker(
  state: GameState,
  workerId: string,
  patch: Partial<Pick<GameState['workers'][number], 'profession' | 'character'>>,
): GameState {
  return edit(state, (d) => {
    const w = d.workers.find((x) => x.id === workerId);
    if (!w) throw new Error(`Нет рабочего ${workerId}`);
    Object.assign(w, patch);
  });
}

export function res(state: GameState, player: PlayerId): Resources {
  return (state.players[player] as GameState['players'][number]).resources;
}

/** Применить действие; события копятся в log, если он передан. */
export function act(state: GameState, action: Action, log?: GameEvent[]): GameState {
  const r = applyAction(state, action);
  log?.push(...r.events);
  return r.state;
}

export function placeActions(state: GameState) {
  return getLegalActions(state).filter(
    (a): a is Extract<Action, { type: 'place' }> => a.type === 'place',
  );
}

/** Разместить рабочего текущего игрока (первого подходящего или указанного). */
export function place(
  state: GameState,
  location: LocationId,
  slot: SlotIndex,
  opts: { displace?: boolean; workerId?: string; log?: GameEvent[] } = {},
): GameState {
  const displace = opts.displace ?? false;
  const action = placeActions(state).find(
    (a) =>
      a.location === location &&
      a.slot === slot &&
      a.displace === displace &&
      (opts.workerId === undefined || a.workerId === opts.workerId),
  );
  if (!action) throw new Error(`Нельзя разместить в ${location}/${slot} (displace=${displace})`);
  return act(state, action, opts.log);
}

export function choose(state: GameState, choice: LocationChoice, log?: GameEvent[]): GameState {
  return act(state, { type: 'locationAction', choice }, log);
}

export function locationOptions(state: GameState): LocationChoice[] {
  return getLegalActions(state).flatMap((a) => (a.type === 'locationAction' ? [a.choice] : []));
}

/**
 * Все пасуют до конца размещения текущего раунда; бои и конец раунда проходят автоматически.
 * Останавливается в начале следующего раунда (или в конце партии).
 */
export function passAll(state: GameState, log?: GameEvent[]): GameState {
  let s = state;
  const round = s.round;
  while (s.pending?.kind === 'placement' && s.round === round) {
    s = act(s, { type: 'pass' }, log);
  }
  return s;
}
