import {
  BUILDING_ORDER,
  CITADELS_PER_PLAYER,
  MONUMENTS,
  OBELISKS_PER_PLAYER,
  REVERSE_TRACK,
  BUILDINGS,
  BUILDING_EFFECTS,
  LOCATIONS,
  MAX_BUILDINGS_PER_TYPE,
  PLOTS,
  CITADEL_COST_CHEAP,
  PLOT_SURCHARGE_CHOICES,
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
import { changeInfluence, changeResources, payMaybeAlchemy, paymentVariants } from './economy';
import { addPrestige } from './prestige';
import { isReverse, monumentSlots, monumentsAt } from './reverse';
import type { BuildChoice, BuildSource, GameState, PlayerId } from './types';

/** Доплата за участок по текущему правилу plotSurcharge. */
export function plotSurcharge(
  state: Pick<GameState, 'config'>,
  plotId: string | null,
): Partial<Resources> {
  const plot = plotId === null ? null : PLOTS.find((p) => p.id === plotId);
  if (!plot) return {};
  const variant = state.config.rules.plotSurcharge;
  if (variant === 'base' || Object.keys(plot.surcharge).length === 0) return plot.surcharge;
  return PLOT_SURCHARGE_VARIANTS[variant][plot.region];
}

/** Цена здания без доплаты участка (Цитадель — по переключателю citadelCost). */
export function buildingCost(
  state: Pick<GameState, 'config'>,
  type: BuildingId,
): Partial<Resources> {
  return type === 'citadel' && state.config.rules.citadelCost === 'cheap'
    ? CITADEL_COST_CHEAP
    : BUILDINGS[type].cost;
}

/** Цена постройки: цена здания + доплата двойного участка. */
export function buildCost(
  state: Pick<GameState, 'config'>,
  choice: BuildChoice,
): Partial<Resources> {
  const cost: Partial<Resources> = { ...buildingCost(state, choice.building) };
  for (const [r, v] of Object.entries(choice.surcharge ?? plotSurcharge(state, choice.plot)) as [
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
  if (
    source.kind === 'reward' ||
    source.kind === 'renegade' ||
    source.kind === 'underground' ||
    source.kind === 'obelisk' ||
    source.kind === 'contractor'
  ) {
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
    // Обелиск — только в эксперименте обратных треков; право отметки −4 — только на Обелиск.
    if (building === 'obelisk' && !isReverse(state)) continue;
    if (source.kind === 'obelisk' && building !== 'obelisk') continue;
    const limit =
      building === 'citadel'
        ? CITADELS_PER_PLAYER
        : building === 'obelisk'
          ? OBELISKS_PER_PLAYER
          : MAX_BUILDINGS_PER_TYPE;
    if (ownedOfType(state, player, building) >= limit) continue;
    for (const region of regions) {
      const candidates: BuildChoice[] = MONUMENTS.includes(building)
        ? monumentAllowed(state, player, building, region)
          ? [{ building, region, plot: null }]
          : []
        : PLOTS.filter(
            (plot) =>
              plot.region === region &&
              !taken.has(plot.id) &&
              (nearLocation === null || plot.adjacent.includes(nearLocation)),
          ).flatMap((plot): BuildChoice[] => {
            const base = { building, region, plot: plot.id };
            const choices = PLOT_SURCHARGE_CHOICES[plot.id];
            return choices ? choices.map((surcharge) => ({ ...base, surcharge })) : [base];
          });
      for (const choice of candidates) {
        for (const v of paymentVariants(state, player, buildCost(state, choice))) {
          out.push(v.alchemy ? { ...choice, alchemy: true } : choice);
        }
      }
    }
  }
  return out;
}

/**
 * Здание на звезде региона. Цитадель (Шпиль): звезда свободна и влияние не ниже порога.
 * Эксперимент influenceModel=reverse: на звезде одно здание — Шпиль или Обелиск; Обелиск —
 * пока влияние игрока на нижнем пределе трека (OQ-48).
 */
function monumentAllowed(
  state: GameState,
  player: PlayerId,
  building: BuildingId,
  region: RegionId,
): boolean {
  const influence = state.players[player]?.influence[region] ?? 0;
  const free = isReverse(state)
    ? monumentsAt(state, region).length < monumentSlots(state)
    : !state.buildings.some((b) => b.type === building && b.region === region);
  if (!free) return false;
  return building === 'obelisk'
    ? influence <= REVERSE_TRACK.min
    : influence >= TRACKS[region].citadelAt;
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
  // Обелиск возвращает влияние строящего в регионе на 0.
  if (choice.building === 'obelisk') {
    const now = c.draft.players[player]?.influence[choice.region] ?? 0;
    changeInfluence(c, player, choice.region, -now, 'obelisk');
  }
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
  if (LOCATIONS[location].region === 'city' && !isReverse(c.draft)) {
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
