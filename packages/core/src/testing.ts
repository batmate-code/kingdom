/** Помощники для тестов ядра. В публичный API не входят. */
import type { LocationId, Resources, SlotIndex } from '@vampire/data';
import { produce } from 'immer';
import type { GameConfigInput } from './config';
import { applyAction, createGame, getLegalActions } from './engine';
import type { Action, GameEvent, GameState, LocationChoice, PlayerId, Position } from './types';

/**
 * Новая партия сразу на шаге размещения 1-го раунда: драфт и улучшение пропущены
 * (выложенные персонажи возвращаются в колоду), у рабочих нет улучшений.
 * Для сценариев драфта — createGame или newGame(..., { withDraft: true }).
 */
export function newGame(
  config: GameConfigInput = {},
  seed = 1,
  opts: { withDraft?: boolean } = {},
): GameState {
  // Сценарии писались при случайном первом игроке (seed задаёт, кто ходит первым), входе в Город
  // за золото, без бонусов треков, с картонной доплатой участков, прежней Мессой и Цитаделью,
  // со стартом без крови (до 24.11) — сохраняем; новые правила проверяются отдельными тестами.
  const created = createGame(
    {
      ...config,
      rules: {
        randomFirstPlayer: true,
        cityEntryResource: 'gold',
        trackBoosts: false,
        plotSurcharge: 'base',
        massBloodToGold: 'base',
        citadelCost: 'base',
        disabledCharacters: false,
        influenceModel: 'classic',
        ...config.rules,
      },
    },
    seed,
  );
  const s = produce(created, (d) => {
    for (const p of d.players) p.resources.blood = 0;
  });
  return opts.withDraft ? s : skipDraft(s);
}

/** Пропустить драфт и улучшение текущего раунда без изменения ресурсов. */
export function skipDraft(state: GameState): GameState {
  const kind = state.pending?.kind;
  if (kind !== 'draftPick' && kind !== 'upgrade') return state;
  return edit(state, (d) => {
    const players = d.config.rules.draftSize === 'players';
    for (const p of d.players) {
      if (p.draftPick.character) d.deck.unshift(p.draftPick.character);
      if (players && p.draftPick.profession) d.professionPool.push(p.draftPick.profession);
      p.draftPick = { character: null, profession: null };
    }
    d.deck.unshift(...d.offer.characters);
    if (players) d.professionPool.push(...d.offer.professions);
    d.offer = { characters: [], professions: [] };
    d.tasks = d.tasks.filter(
      (t) => t.t !== 'askDraft' && t.t !== 'askUpgrade' && t.t !== 'placementTurn',
    );
    d.phase = 'placement';
    d.placementCurrent = d.firstPlayer;
    d.pending = { kind: 'placement', player: d.firstPlayer };
  });
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

/**
 * Дать рабочему профессию и/или персонажа, сохраняя инварианты: персонаж берётся из колоды
 * (если не указан — первая карта колоды), снятый персонаж возвращается в колоду; при драфте по
 * числу игроков профессия так же берётся из пула профессий и возвращается в него.
 */
export function setWorker(
  state: GameState,
  workerId: string,
  patch: Partial<Pick<GameState['workers'][number], 'profession' | 'character'>>,
): GameState {
  return edit(state, (d) => {
    const w = d.workers.find((x) => x.id === workerId);
    if (!w) throw new Error(`Нет рабочего ${workerId}`);
    const profession = patch.profession !== undefined ? patch.profession : w.profession;
    if (d.config.rules.draftSize === 'players' && profession !== w.profession) {
      if (w.profession) d.professionPool.push(w.profession);
      if (profession) {
        const i = d.professionPool.indexOf(profession);
        if (i < 0) throw new Error(`Профессии ${profession} нет в пуле`);
        d.professionPool.splice(i, 1);
      }
    }
    if (profession === null) {
      if (w.character) d.deck.unshift(w.character);
      w.character = null;
      w.profession = null;
      return;
    }
    let character = patch.character !== undefined ? patch.character : w.character;
    if (character === null) character = d.deck[0] ?? null;
    if (character === null) throw new Error('Колода пуста');
    if (character !== w.character) {
      const i = d.deck.indexOf(character);
      if (i < 0) throw new Error(`Персонажа ${character} нет в колоде`);
      d.deck.splice(i, 1);
      if (w.character) d.deck.unshift(w.character);
    }
    w.character = character;
    w.profession = profession;
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
 * Доиграть текущий раунд: все пасуют, в остальных решениях (награда за бой, содержание) берётся
 * первый вариант — для содержания это «оплатить», если хватает крови.
 * Останавливается на размещении следующего раунда (драфт пропускается) или в конце партии.
 */
export function passAll(state: GameState, log?: GameEvent[]): GameState {
  let s = state;
  const round = s.round;
  while (s.round === round && s.pending) {
    const action: Action =
      s.pending.kind === 'placement' ? { type: 'pass' } : (getLegalActions(s)[0] as Action);
    s = act(s, action, log);
  }
  return skipDraft(s);
}
