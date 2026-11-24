import { MONUMENTS, REVERSE_TRACK, type RegionId } from '@vampire/data';
import type { Ctx } from './context';
import type { Building, GameState, PlayerId } from './types';

/**
 * Эксперимент автора 23.11 «обратные треки, Шпиль и Обелиск» (influenceModel=reverse, ответы
 * пп. 27–33). Здесь — общие правила режима; места, где он меняет игру, вызывают эти функции.
 */

export function isReverse(state: Pick<GameState, 'config'>): boolean {
  return state.config.rules.influenceModel === 'reverse';
}

/** Нижний предел влияния: 0 в обычной игре, −4 в эксперименте. */
export function influenceMin(state: Pick<GameState, 'config'>): number {
  return isReverse(state) ? REVERSE_TRACK.min : 0;
}

/** Здание на звезде региона (Цитадель/Шпиль или Обелиск) — одно на регион в эксперименте. */
export function monumentAt(state: Pick<GameState, 'buildings'>, region: RegionId): Building | null {
  return state.buildings.find((b) => b.region === region && MONUMENTS.includes(b.type)) ?? null;
}

/** Шпиль игрока в регионе: победа там позволяет взять ПО вместо награды. */
export function ownsSpire(state: GameState, player: PlayerId, region: RegionId): boolean {
  return (
    isReverse(state) &&
    state.buildings.some((b) => b.type === 'citadel' && b.owner === player && b.region === region)
  );
}

/** Ключ полученной награды отметки в trackBoostsTaken: «регион-отметка» (`forest--3`). */
const markKey = (region: RegionId, at: number) => `${region}-${at}`;

/**
 * Влияние опустилось с `from` до `to`: награды всех пройденных отметок снизу (перескочил две —
 * получает обе). Одноразовые (`once`) — только если игрок ещё не получал их в этом регионе.
 */
export function undergroundMarks(
  c: Ctx,
  player: PlayerId,
  region: RegionId,
  from: number,
  to: number,
  give: {
    ore(amount: number): void;
  },
): void {
  if (!isReverse(c.draft) || to >= from) return;
  const p = c.draft.players[player];
  if (!p) throw new Error(`Нет игрока ${player}`);
  for (const mark of REVERSE_TRACK.marks) {
    // Отметка пройдена этим спуском: была выше неё, стала на ней или ниже.
    if (to > mark.at || from <= mark.at) continue;
    const key = markKey(region, mark.at);
    if (mark.once) {
      if (p.trackBoostsTaken.includes(key)) continue;
      p.trackBoostsTaken.push(key);
    }
    c.events.push({ type: 'undergroundMark', player, region, at: mark.at });
    const r = mark.reward;
    if (r.kind === 'ore') give.ore(r.ore);
    else if (r.kind === 'buildRight') {
      c.draft.tasks.unshift({ t: 'askBuild', player, source: { kind: 'underground', region } });
    } else if (r.kind === 'strength') {
      p.undergroundStrength[region] += r.strength;
    } else if (r.kind === 'obelisk') {
      // Право построить Обелиск сразу; позже — любым правом стройки, пока игрок на −4 (OQ-48).
      c.draft.tasks.unshift({ t: 'askBuild', player, source: { kind: 'obelisk', region } });
    }
  }
}
