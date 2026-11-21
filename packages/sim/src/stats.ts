import {
  getScores,
  type GameEvent,
  type GameState,
  type PlayerId,
  type ResourceReason,
} from '@vampire/core';
import { REGION_ORDER, TRACKS, type CharacterId, type LocationId } from '@vampire/data';

type Res = 'gold' | 'blood' | 'ore' | 'compromat';
const RES: readonly Res[] = ['gold', 'blood', 'ore', 'compromat'];

/** Статистика одной партии, собранная по событиям. */
export interface GameStats {
  players: number;
  winners: PlayerId[];
  vp: number[];
  locations: Record<
    string,
    {
      placements: [number, number];
      winnerPlacements: number;
      displaced: number;
      skipped: number;
      copied: number;
    }
  >;
  characters: Record<
    string,
    {
      offered: number;
      drafted: number;
      draftedByWinner: number;
      assigned: number;
      triggered: number;
      discardedUpkeep: number;
      discardedDraft: number;
      replaced: number;
      heldAtEnd: number;
      heldAtEndByWinner: number;
      heldAtEndVp: number;
    }
  >;
  /** Ресурсы: получено и потрачено по причинам, остаток в конце (сумма по игрокам). */
  resources: Record<
    Res,
    {
      gained: Record<string, number>;
      spent: Record<string, number>;
      leftAtEnd: number;
      leftAtEndWinners: number;
    }
  >;
  /** Запас ресурсов в конце каждого раунда (сумма по игрокам). */
  stockByRound: Record<Res, number[]>;
  /** Сброшенные на содержании пары (нехватка крови или выбор). */
  upkeepDiscards: number;
  /** Влияние по регионам: приход и потери по причинам, итог (сумма по игрокам и у победителей). */
  influence: Record<
    string,
    {
      gained: Record<string, number>;
      lost: Record<string, number>;
      final: number;
      finalWinners: number;
      /** Сколько игроков закончили на отметке ПО или выше: по каждой отметке. */
      reached: Record<string, number>;
      firstToMax: number;
      citadels: number;
    }
  >;
}

/** Сборщик: события партии по ходу, финальное состояние в конце. */
export class StatsCollector {
  private readonly placements: { player: PlayerId; location: LocationId; slot: number }[] = [];
  private readonly displaced: LocationId[] = [];
  private readonly skips: LocationId[] = [];
  private readonly copies: LocationId[] = [];
  private readonly drafted: { player: PlayerId; character: CharacterId }[] = [];
  private readonly offered: CharacterId[] = [];
  private readonly assigned: CharacterId[] = [];
  private readonly triggered: CharacterId[] = [];
  private readonly discards: { character: CharacterId; reason: string }[] = [];
  private readonly flows: { player: PlayerId; res: Res; amount: number; reason: ResourceReason }[] =
    [];
  private readonly stock: Record<Res, number[]> = { gold: [], blood: [], ore: [], compromat: [] };
  private readonly influence: { region: string; amount: number; reason: string }[] = [];

  onEvents(events: readonly GameEvent[], state: GameState): void {
    for (const e of events) {
      switch (e.type) {
        case 'workerPlaced':
          this.placements.push({ player: e.player, location: e.location, slot: e.slot });
          break;
        case 'workerDisplaced':
          this.displaced.push(e.location);
          break;
        case 'locationActionResolved':
          if (e.copy) this.copies.push(e.location);
          else if (e.choice.kind === 'skip') this.skips.push(e.location);
          break;
        case 'draftOffered':
          this.offered.push(...e.characters);
          break;
        case 'draftPicked':
          if (e.pick.kind === 'character')
            this.drafted.push({ player: e.player, character: e.pick.character });
          break;
        case 'workerUpgraded':
          this.assigned.push(e.character);
          break;
        case 'characterTriggered':
          this.triggered.push(e.character);
          break;
        case 'pairDiscarded':
          this.discards.push({ character: e.character, reason: e.reason });
          break;
        case 'resourcesChanged':
          for (const r of RES) {
            const amount = e.delta[r];
            if (amount) this.flows.push({ player: e.player, res: r, amount, reason: e.reason });
          }
          break;
        case 'influenceChanged':
          this.influence.push({ region: e.region, amount: e.to - e.from, reason: e.reason });
          break;
        case 'roundEnded':
          for (const r of RES) {
            this.stock[r][e.round - 1] = state.players.reduce((s, p) => s + p.resources[r], 0);
          }
          break;
        default:
          break;
      }
    }
  }

  finish(state: GameState): GameStats {
    const scores = getScores(state);
    const winners = scores.filter((s) => s.rank === 1).map((s) => s.player);
    const isWinner = (p: PlayerId) => winners.includes(p);

    const locations: GameStats['locations'] = {};
    const loc = (id: string) =>
      (locations[id] ??= {
        placements: [0, 0],
        winnerPlacements: 0,
        displaced: 0,
        skipped: 0,
        copied: 0,
      });
    for (const p of this.placements) {
      const l = loc(p.location);
      l.placements[p.slot === 1 ? 0 : 1] += 1;
      if (isWinner(p.player)) l.winnerPlacements += 1;
    }
    for (const id of this.displaced) loc(id).displaced += 1;
    for (const id of this.skips) loc(id).skipped += 1;
    for (const id of this.copies) loc(id).copied += 1;

    const characters: GameStats['characters'] = {};
    const ch = (id: string) =>
      (characters[id] ??= {
        offered: 0,
        drafted: 0,
        draftedByWinner: 0,
        assigned: 0,
        triggered: 0,
        discardedUpkeep: 0,
        discardedDraft: 0,
        replaced: 0,
        heldAtEnd: 0,
        heldAtEndByWinner: 0,
        heldAtEndVp: 0,
      });
    for (const id of this.offered) ch(id).offered += 1;
    for (const d of this.drafted) {
      const c = ch(d.character);
      c.drafted += 1;
      if (isWinner(d.player)) c.draftedByWinner += 1;
    }
    for (const id of this.assigned) ch(id).assigned += 1;
    for (const id of this.triggered) ch(id).triggered += 1;
    for (const d of this.discards) {
      const c = ch(d.character);
      if (d.reason === 'upkeep') c.discardedUpkeep += 1;
      else if (d.reason === 'draft') c.discardedDraft += 1;
      else c.replaced += 1;
    }
    for (const w of state.workers) {
      if (!w.character) continue;
      const c = ch(w.character);
      c.heldAtEnd += 1;
      if (isWinner(w.owner)) c.heldAtEndByWinner += 1;
      c.heldAtEndVp += scores.find((s) => s.player === w.owner)?.vp ?? 0;
    }

    const resources = Object.fromEntries(
      RES.map((r) => [r, { gained: {}, spent: {}, leftAtEnd: 0, leftAtEndWinners: 0 }]),
    ) as GameStats['resources'];
    for (const f of this.flows) {
      const bucket = f.amount > 0 ? resources[f.res].gained : resources[f.res].spent;
      bucket[f.reason] = (bucket[f.reason] ?? 0) + Math.abs(f.amount);
    }
    state.players.forEach((p, i) => {
      for (const r of RES) {
        resources[r].leftAtEnd += p.resources[r];
        if (isWinner(i)) resources[r].leftAtEndWinners += p.resources[r];
      }
    });

    const influence: GameStats['influence'] = {};
    for (const region of REGION_ORDER) {
      const reached: Record<string, number> = {};
      for (const m of TRACKS[region].vpMarks) {
        reached[String(m)] = state.players.filter((p) => p.influence[region] >= m).length;
      }
      influence[region] = {
        gained: {},
        lost: {},
        final: state.players.reduce((s, p) => s + p.influence[region], 0),
        finalWinners: winners.reduce((s, w) => s + (state.players[w]?.influence[region] ?? 0), 0),
        reached,
        firstToMax: state.firstToMax[region] === undefined ? 0 : 1,
        citadels: state.buildings.some((b) => b.type === 'citadel' && b.region === region) ? 1 : 0,
      };
    }
    for (const f of this.influence) {
      const r = influence[f.region];
      if (!r) continue;
      const bucket = f.amount > 0 ? r.gained : r.lost;
      bucket[f.reason] = (bucket[f.reason] ?? 0) + Math.abs(f.amount);
    }

    return {
      players: state.players.length,
      winners,
      vp: scores.map((s) => s.vp),
      locations,
      characters,
      resources,
      stockByRound: this.stock,
      upkeepDiscards: this.discards.filter((d) => d.reason === 'upkeep').length,
      influence,
    };
  }
}

/** Сводная статистика по многим партиям (суммы; доли считаются в отчёте). */
export interface AggregateStats {
  games: number;
  playerSlots: number;
  winnerSlots: number;
  locations: GameStats['locations'];
  characters: GameStats['characters'];
  resources: GameStats['resources'];
  stockByRound: Record<Res, number[]>;
  upkeepDiscards: number;
  influence: GameStats['influence'];
}

export function emptyAggregate(): AggregateStats {
  return {
    games: 0,
    playerSlots: 0,
    winnerSlots: 0,
    locations: {},
    characters: {},
    resources: Object.fromEntries(
      RES.map((r) => [r, { gained: {}, spent: {}, leftAtEnd: 0, leftAtEndWinners: 0 }]),
    ) as GameStats['resources'],
    stockByRound: { gold: [], blood: [], ore: [], compromat: [] },
    upkeepDiscards: 0,
    influence: {},
  };
}

function addNumbers<T extends object>(into: T, from: T): void {
  for (const [k, v] of Object.entries(from)) {
    const cur = (into as Record<string, unknown>)[k];
    if (typeof v === 'number') (into as Record<string, number>)[k] = ((cur as number) ?? 0) + v;
    else if (Array.isArray(v)) {
      const arr = (Array.isArray(cur) ? cur : []) as number[];
      v.forEach((x: number, i: number) => (arr[i] = (arr[i] ?? 0) + (x ?? 0)));
      (into as Record<string, unknown>)[k] = arr;
    } else if (v && typeof v === 'object') {
      const obj = (cur && typeof cur === 'object' ? cur : {}) as object;
      addNumbers(obj, v as object);
      (into as Record<string, unknown>)[k] = obj;
    }
  }
}

export function mergeStats(agg: AggregateStats, g: GameStats): void {
  agg.games += 1;
  agg.playerSlots += g.players;
  agg.winnerSlots += g.winners.length;
  agg.upkeepDiscards += g.upkeepDiscards;
  addNumbers(agg.locations, g.locations);
  addNumbers(agg.characters, g.characters);
  addNumbers(agg.resources, g.resources);
  addNumbers(agg.stockByRound, g.stockByRound);
  addNumbers(agg.influence, g.influence);
}
