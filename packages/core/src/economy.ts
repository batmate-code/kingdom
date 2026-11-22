import {
  ALCHEMY,
  CITY_ENTRY,
  TRACKS,
  TRACK_BOOSTS,
  type RegionId,
  type ResourceId,
  type Resources,
} from '@vampire/data';
import type { Ctx } from './context';
import type { GameState, InfluenceReason, PlayerId, ResourceReason } from './types';

const RESOURCE_IDS: readonly ResourceId[] = ['gold', 'blood', 'ore', 'compromat'];

export function canAfford(state: GameState, player: PlayerId, cost: Partial<Resources>): boolean {
  const res = state.players[player]?.resources;
  if (!res) return false;
  return RESOURCE_IDS.every((r) => res[r] >= (cost[r] ?? 0));
}

/** Изменить ресурсы игрока на delta (отрицательные значения — оплата). Нехватка — ошибка движка. */
export function changeResources(
  c: Ctx,
  player: PlayerId,
  delta: Partial<Resources>,
  reason: ResourceReason,
): void {
  const p = c.draft.players[player];
  if (!p) throw new Error(`Нет игрока ${player}`);
  const clean: Partial<Resources> = {};
  for (const r of RESOURCE_IDS) {
    const d = delta[r] ?? 0;
    if (d === 0) continue;
    if (p.resources[r] + d < 0) {
      throw new Error(`Игроку ${player} не хватает ресурса ${r} (${reason})`);
    }
    p.resources[r] += d;
    clean[r] = d;
  }
  if (Object.keys(clean).length > 0) {
    c.events.push({ type: 'resourcesChanged', player, delta: clean, reason });
  }
}

export function pay(
  c: Ctx,
  player: PlayerId,
  cost: Partial<Resources>,
  reason: ResourceReason,
): void {
  const delta: Partial<Resources> = {};
  for (const r of RESOURCE_IDS) {
    const v = cost[r];
    if (v) delta[r] = -v;
  }
  changeResources(c, player, delta, reason);
}

/** Алхимик активен у игрока в текущем размещении. */
export function alchemyActive(state: GameState, player: PlayerId): boolean {
  return state.alchemy === player;
}

/** Цена с заменой 1 руды на 1 золото (Алхимик). */
export function alchemize(cost: Partial<Resources>): Partial<Resources> {
  if ((cost.ore ?? 0) < ALCHEMY.oreReplaced) return cost;
  return {
    ...cost,
    ore: (cost.ore ?? 0) - ALCHEMY.oreReplaced,
    gold: (cost.gold ?? 0) + ALCHEMY.goldInstead,
  };
}

/**
 * Оплатить цену; с заменой Алхимика — 1 руда → 1 золото. Замена одна на всё размещение
 * Алхимика (ответ автора, 22.11), поэтому после неё Алхимик больше не действует.
 */
export function payMaybeAlchemy(
  c: Ctx,
  player: PlayerId,
  cost: Partial<Resources>,
  alchemy: boolean | undefined,
  reason: ResourceReason,
): void {
  if (alchemy) {
    if (c.draft.alchemy !== player) throw new Error('Алхимик сейчас не действует');
    c.draft.alchemy = null;
  }
  pay(c, player, alchemy ? alchemize(cost) : cost, reason);
}

/** Варианты оплаты: обычная и (если доступно) с заменой Алхимика; только по карману. */
export function paymentVariants(
  state: GameState,
  player: PlayerId,
  cost: Partial<Resources>,
): { cost: Partial<Resources>; alchemy: boolean }[] {
  const out: { cost: Partial<Resources>; alchemy: boolean }[] = [];
  if (canAfford(state, player, cost)) out.push({ cost, alchemy: false });
  if (alchemyActive(state, player) && (cost.ore ?? 0) >= ALCHEMY.oreReplaced) {
    const alt = alchemize(cost);
    if (canAfford(state, player, alt)) out.push({ cost: alt, alchemy: true });
  }
  return out;
}

/** Чем платят вход в Город (переключатель cityEntryResource). */
export function cityEntryResource(state: GameState): 'gold' | 'blood' {
  return state.config.rules.cityEntryResource;
}

export function cityEntryCost(state: GameState): number {
  return Math.min(
    CITY_ENTRY.base + CITY_ENTRY.raiseStep * state.cityEntryRaisedRegions.length,
    CITY_ENTRY.max,
  );
}

/**
 * Изменить влияние в пределах трека (0..max). Здесь же срабатывают рубежи трека:
 * подорожание входа в Город (один раз на регион) и жетон первенства.
 */
export function changeInfluence(
  c: Ctx,
  player: PlayerId,
  region: RegionId,
  amount: number,
  reason: InfluenceReason,
): void {
  const p = c.draft.players[player];
  if (!p) throw new Error(`Нет игрока ${player}`);
  const track = TRACKS[region];
  const from = p.influence[region];
  const to = Math.max(0, Math.min(track.max, from + amount));
  if (to === from) return;
  p.influence[region] = to;
  c.events.push({ type: 'influenceChanged', player, region, from, to, reason });

  const raiseAt = track.cityEntryRaiseAt;
  if (raiseAt !== null && to >= raiseAt && !c.draft.cityEntryRaisedRegions.includes(region)) {
    c.draft.cityEntryRaisedRegions.push(region);
    c.events.push({ type: 'cityEntryRaised', region, cost: cityEntryCost(c.draft) });
  }
  if (to === track.max && c.draft.firstToMax[region] === undefined) {
    c.draft.firstToMax[region] = player;
  }
  if (c.draft.config.rules.trackBoosts) {
    for (const boost of TRACK_BOOSTS[region]) {
      const key = `${region}-${boost.at}`;
      if (to < boost.at || p.trackBoostsTaken.includes(key)) continue;
      p.trackBoostsTaken.push(key);
      c.events.push({ type: 'trackBoost', player, region, at: boost.at });
      changeResources(c, player, boost.gain, 'trackBoost');
    }
  }
}
