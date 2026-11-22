import {
  BUILDING_ORDER,
  CITADELS_PER_PLAYER,
  BUILDINGS,
  BUILDING_EFFECTS,
  LOCATIONS,
  MAX_BUILDINGS_PER_TYPE,
  PLOTS,
  PLOT_SURCHARGE_VARIANTS,
  REGION_ORDER,
  TRACKS,
  type BuildingId,
  type LocationId,
  type RegionId,
  type Resources,
} from '@vampire/data';
import { getWorker } from './board';
import type { Ctx } from './context';
import { changeResources, payMaybeAlchemy, paymentVariants } from './economy';
import { addPrestige } from './prestige';
import type { BuildChoice, BuildSource, GameState, PlayerId } from './types';

/** Доплата за участок по текущему правилу plotSurcharge. */
export function plotSurcharge(state: GameState, plotId: string | null): Partial<Resources> {
  const plot = plotId === null ? null : PLOTS.find((p) => p.id === plotId);
  if (!plot) return {};
  const variant = state.config.rules.plotSurcharge;
  if (variant === 'base' || Object.keys(plot.surcharge).length === 0) return plot.surcharge;
  return PLOT_SURCHARGE_VARIANTS[variant][plot.region];
}

/** Цена постройки: цена здания + доплата двойного участка. */
export function buildCost(state: GameState, choice: BuildChoice): Partial<Resources> {
  const cost: Partial<Resources> = { ...BUILDINGS[choice.building].cost };
  for (const [r, v] of Object.entries(plotSurcharge(state, choice.plot)) as [
    keyof Resources,
    number,
  ][]) {
    cost[r] = (cost[r] ?? 0) + v;
  }
  return cost;
}

function ownedOfType(state: GameState, player: PlayerId, type: BuildingId): number {
  return state.buildings.filter((b) => b.owner === player && b.type === type).length;
}

/** Где строит источник: регионы и (для Архитектора) участки рядом с его локацией. */
function sourceScope(
  state: GameState,
  source: BuildSource,
): { regions: readonly RegionId[]; nearLocation: LocationId | null } {
  if (source.kind === 'chancery') return { regions: REGION_ORDER, nearLocation: null };
  if (source.kind === 'reward' || source.kind === 'renegade') {
    return { regions: [source.region], nearLocation: null };
  }
  const w = getWorker(state, source.workerId);
  if (w.position.kind !== 'slot') return { regions: [], nearLocation: null };
  const location = w.position.location;
  return { regions: [LOCATIONS[location].region], nearLocation: location };
}

/**
 * Все постройки, доступные игроку из источника: свободный участок (для Архитектора — рядом с его
 * локацией), не больше 3 зданий типа, Цитадель — одна на регион и при достаточном влиянии,
 * хватает ресурсов на цену с доплатой.
 */
export function buildOptions(
  state: GameState,
  player: PlayerId,
  source: BuildSource,
): BuildChoice[] {
  const p = state.players[player];
  if (!p) return [];
  const { regions, nearLocation } = sourceScope(state, source);
  const taken = new Set(state.buildings.map((b) => b.plot));
  const out: BuildChoice[] = [];
  for (const building of BUILDING_ORDER) {
    const limit = building === 'citadel' ? CITADELS_PER_PLAYER : MAX_BUILDINGS_PER_TYPE;
    if (ownedOfType(state, player, building) >= limit) continue;
    for (const region of regions) {
      const candidates: BuildChoice[] =
        building === 'citadel'
          ? state.buildings.some((b) => b.type === 'citadel' && b.region === region) ||
            p.influence[region] < TRACKS[region].citadelAt
            ? []
            : [{ building, region, plot: null }]
          : PLOTS.filter(
              (plot) =>
                plot.region === region &&
                !taken.has(plot.id) &&
                (nearLocation === null || plot.adjacent.includes(nearLocation)),
            ).map((plot) => ({ building, region, plot: plot.id }));
      for (const choice of candidates) {
        for (const v of paymentVariants(state, player, buildCost(state, choice))) {
          out.push(v.alchemy ? { ...choice, alchemy: true } : choice);
        }
      }
    }
  }
  return out;
}

/** Построить: оплата, здание на участке (Цитадель — на звезде), престиж по номеру здания типа. */
export function applyBuild(c: Ctx, player: PlayerId, choice: BuildChoice): void {
  const number = ownedOfType(c.draft, player, choice.building);
  const cost = buildCost(c.draft, choice);
  payMaybeAlchemy(c, player, cost, choice.alchemy, 'build');
  c.draft.buildings.push({
    type: choice.building,
    owner: player,
    region: choice.region,
    plot: choice.plot,
  });
  const { alchemy: _alchemy, ...built } = choice;
  c.events.push({ type: 'buildingBuilt', player, ...built });
  addPrestige(c, player, BUILDINGS[choice.building].prestige[number] ?? 0, 'building');
}

function adjacentBuildings(state: GameState, type: BuildingId, location: LocationId) {
  return state.buildings.filter((b) => {
    if (b.type !== type || b.plot === null) return false;
    return PLOTS.find((p) => p.id === b.plot)?.adjacent.includes(location) ?? false;
  });
}

/** Аббатство: +2 крови владельцу за каждое вытеснение из соседней локации (и Палачом). */
export function onDisplaced(c: Ctx, location: LocationId): void {
  for (const b of adjacentBuildings(c.draft, 'abbey', location)) {
    changeResources(c, b.owner, { blood: BUILDING_EFFECTS.abbeyBloodPerDisplacement }, 'abbey');
  }
}

/**
 * Рабочий игрока пришёл в локацию (размещение, не копия и не перемещение к месту Цитадели):
 * Лавка рядом даёт владельцу 1 золото, Цитадель Города — 1 компромат (если рабочий чужой).
 */
export function onVisit(c: Ctx, player: PlayerId, location: LocationId): void {
  for (const b of adjacentBuildings(c.draft, 'shop', location)) {
    if (b.owner !== player) {
      changeResources(c, b.owner, { gold: BUILDING_EFFECTS.shopGoldPerVisit }, 'shop');
    }
  }
  if (LOCATIONS[location].region === 'city') {
    const citadel = c.draft.buildings.find((b) => b.type === 'citadel' && b.region === 'city');
    if (citadel && citadel.owner !== player) {
      changeResources(
        c,
        citadel.owner,
        { compromat: BUILDING_EFFECTS.cityCitadelCompromatPerVisit },
        'cityCitadel',
      );
    }
  }
}

export function ownsCitadel(state: GameState, player: PlayerId, region: RegionId): boolean {
  return state.buildings.some(
    (b) => b.type === 'citadel' && b.owner === player && b.region === region,
  );
}
