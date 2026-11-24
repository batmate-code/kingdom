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
      /** Сумма номеров раундов, в которых персонажа взяли на драфте (средний раунд пика). */
      draftedRoundSum: number;
      /** Сумма очерёдности среди персонажей драфта раунда (1 — взят первым). */
      draftedOrderSum: number;
      /** Сколько раз взят на драфте в раунде N (индекс — раунд − 1). */
      draftedByRound: number[];
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
  /** То же у победителей (сумма по победителям партии). */
  stockByRoundWinners: Record<Res, number[]>;
  /** Рабочих в госпитале по раундам: максимум за раунд (сумма по игрокам). */
  hospitalByRound: number[];
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
  /**
   * Здания на звезде региона: построено и у победителей; ПО Шпиля (эксперимент influenceModel=reverse).
   * Ключи: citadel, obelisk.
   */
  monuments: Record<string, { built: number; byWinner: number; vp: number; vpByWinner: number }>;
  /**
   * Жетоны боя: сколько раз сыгран, сколько боёв выиграл сыгравший; Приманка — потеря влияния
   * (индекс — 0, 1, 2).
   */
  combatTokens: Record<string, { played: number; won: number; decoyLoss: number[] }>;
  /**
   * Спуск по трекам ниже 0 (обратные треки): «игроко-регион» — пара игрок + регион.
   * belowZeroByReason — сколько единиц влияния ушло ниже 0 по причинам; minReached — у скольких
   * игроко-регионов минимум за партию был ровно −1…−4; marks — сработавшие отметки снизу (раз).
   */
  descent: {
    wentBelowZero: number;
    wentBelowZeroWinners: number;
    endBelowZero: number;
    belowZeroByReason: Record<string, number>;
    minReached: Record<string, number>;
    marks: Record<string, number>;
    marksWinners: Record<string, number>;
  };
  /** Участки: сколько построено, каких зданий, у победителей; Цитадели — под ключом citadel-<регион>. */
  plots: Record<
    string,
    { built: number; byWinner: number; round: number; buildings: Record<string, number> }
  >;
}

/** Сборщик: события партии по ходу, финальное состояние в конце. */
export class StatsCollector {
  private readonly placements: { player: PlayerId; location: LocationId; slot: number }[] = [];
  private readonly displaced: LocationId[] = [];
  private readonly skips: LocationId[] = [];
  private readonly copies: LocationId[] = [];
  private readonly drafted: {
    player: PlayerId;
    character: CharacterId;
    round: number;
    order: number;
  }[] = [];
  /** Сколько персонажей уже взято на драфте текущего раунда. */
  private draftOrder = 0;
  private readonly offered: CharacterId[] = [];
  private readonly assigned: CharacterId[] = [];
  private readonly triggered: CharacterId[] = [];
  private readonly discards: { character: CharacterId; reason: string }[] = [];
  private readonly flows: { player: PlayerId; res: Res; amount: number; reason: ResourceReason }[] =
    [];
  private readonly stock: Record<Res, number[]> = { gold: [], blood: [], ore: [], compromat: [] };
  private readonly hospital: number[] = [];
  /** Запас каждого игрока в конце раунда: [раунд][игрок][ресурс]. */
  private readonly stockPerPlayer: Record<Res, number>[][] = [];
  private readonly influence: { region: string; amount: number; reason: string }[] = [];
  /** Минимум влияния за партию: ключ «игрок:регион». */
  private readonly minInfluence = new Map<string, number>();
  private readonly belowZero: Record<string, number> = {};
  private readonly marks: { player: PlayerId; at: number }[] = [];
  private readonly spireVp: { player: PlayerId; vp: number }[] = [];
  /** Жетоны боя, вскрытые в текущем бою: кто что сыграл (до объявления победителя). */
  private openPlays: { player: PlayerId; token: string; loss: number | undefined }[] = [];
  private readonly tokenPlays: {
    player: PlayerId;
    token: string;
    loss: number | undefined;
    won: boolean;
  }[] = [];
  private readonly builds: { player: PlayerId; key: string; building: string; round: number }[] =
    [];

  onEvents(events: readonly GameEvent[], state: GameState): void {
    const inHospital = state.workers.filter((w) => w.position.kind === 'hospital').length;
    const r = state.round - 1;
    this.hospital[r] = Math.max(this.hospital[r] ?? 0, inHospital);
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
          this.draftOrder = 0;
          break;
        case 'draftPicked':
          if (e.pick.kind === 'character')
            this.drafted.push({
              player: e.player,
              character: e.pick.character,
              round: state.round,
              order: ++this.draftOrder,
            });
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
          {
            const key = `${e.player}:${e.region}`;
            this.minInfluence.set(key, Math.min(this.minInfluence.get(key) ?? 0, e.to));
            const under = Math.min(0, e.from) - Math.min(0, e.to);
            if (under > 0) this.belowZero[e.reason] = (this.belowZero[e.reason] ?? 0) + under;
          }
          break;
        case 'undergroundMark':
          this.marks.push({ player: e.player, at: e.at });
          break;
        case 'buildingBuilt':
          this.builds.push({
            player: e.player,
            key: e.plot ?? `citadel-${e.region}`,
            building: e.building,
            round: state.round,
          });
          break;
        case 'spireVp':
          this.spireVp.push({ player: e.player, vp: e.vp });
          break;
        case 'combatTokensRevealed':
          this.openPlays = e.plays.map((p) => ({
            player: p.player,
            token: p.token,
            loss: p.influenceLoss,
          }));
          break;
        case 'combatResolved':
          for (const p of this.openPlays)
            this.tokenPlays.push({ ...p, won: p.player === e.winner });
          this.openPlays = [];
          break;
        case 'roundEnded':
          for (const r of RES) {
            this.stock[r][e.round - 1] = state.players.reduce((s, p) => s + p.resources[r], 0);
          }
          this.stockPerPlayer[e.round - 1] = state.players.map((p) => ({ ...p.resources }));
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
        draftedRoundSum: 0,
        draftedOrderSum: 0,
        draftedByRound: [],
      });
    for (const id of this.offered) ch(id).offered += 1;
    for (const d of this.drafted) {
      const c = ch(d.character);
      c.drafted += 1;
      if (isWinner(d.player)) c.draftedByWinner += 1;
      c.draftedRoundSum += d.round;
      c.draftedOrderSum += d.order;
      c.draftedByRound[d.round - 1] = (c.draftedByRound[d.round - 1] ?? 0) + 1;
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

    const plots: GameStats['plots'] = {};
    for (const b of this.builds) {
      const pl = (plots[b.key] ??= { built: 0, byWinner: 0, round: 0, buildings: {} });
      pl.built += 1;
      pl.round += b.round;
      if (isWinner(b.player)) pl.byWinner += 1;
      pl.buildings[b.building] = (pl.buildings[b.building] ?? 0) + 1;
    }

    const monuments: GameStats['monuments'] = {};
    const mon = (k: string) => (monuments[k] ??= { built: 0, byWinner: 0, vp: 0, vpByWinner: 0 });
    for (const b of state.buildings) {
      if (b.type !== 'citadel' && b.type !== 'obelisk') continue;
      const m = mon(b.type);
      m.built += 1;
      if (isWinner(b.owner)) m.byWinner += 1;
    }
    for (const v of this.spireVp) {
      const m = mon('citadel');
      m.vp += v.vp;
      if (isWinner(v.player)) m.vpByWinner += v.vp;
    }
    const descent: GameStats['descent'] = {
      wentBelowZero: 0,
      wentBelowZeroWinners: 0,
      endBelowZero: 0,
      belowZeroByReason: { ...this.belowZero },
      minReached: {},
      marks: {},
      marksWinners: {},
    };
    for (const [key, min] of this.minInfluence) {
      if (min >= 0) continue;
      descent.wentBelowZero += 1;
      if (isWinner(Number(key.split(':')[0]))) descent.wentBelowZeroWinners += 1;
      descent.minReached[String(min)] = (descent.minReached[String(min)] ?? 0) + 1;
    }
    for (const p of state.players) {
      for (const region of REGION_ORDER) if (p.influence[region] < 0) descent.endBelowZero += 1;
    }
    for (const m of this.marks) {
      descent.marks[String(m.at)] = (descent.marks[String(m.at)] ?? 0) + 1;
      if (isWinner(m.player)) {
        descent.marksWinners[String(m.at)] = (descent.marksWinners[String(m.at)] ?? 0) + 1;
      }
    }
    const combatTokens: GameStats['combatTokens'] = {};
    for (const t of this.tokenPlays) {
      const c = (combatTokens[t.token] ??= { played: 0, won: 0, decoyLoss: [] });
      c.played += 1;
      if (t.won) c.won += 1;
      if (t.loss !== undefined) c.decoyLoss[t.loss] = (c.decoyLoss[t.loss] ?? 0) + 1;
    }

    return {
      players: state.players.length,
      winners,
      vp: scores.map((s) => s.vp),
      locations,
      characters,
      resources,
      stockByRound: this.stock,
      hospitalByRound: this.hospital,
      stockByRoundWinners: Object.fromEntries(
        RES.map((r) => [
          r,
          this.stockPerPlayer.map((round) => winners.reduce((s, w) => s + (round[w]?.[r] ?? 0), 0)),
        ]),
      ) as Record<Res, number[]>,
      upkeepDiscards: this.discards.filter((d) => d.reason === 'upkeep').length,
      influence,
      monuments,
      combatTokens,
      descent,
      plots,
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
  stockByRoundWinners: Record<Res, number[]>;
  hospitalByRound: number[];
  upkeepDiscards: number;
  influence: GameStats['influence'];
  monuments: GameStats['monuments'];
  combatTokens: GameStats['combatTokens'];
  descent: GameStats['descent'];
  plots: GameStats['plots'];
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
    stockByRoundWinners: { gold: [], blood: [], ore: [], compromat: [] },
    hospitalByRound: [],
    upkeepDiscards: 0,
    influence: {},
    monuments: {},
    combatTokens: {},
    descent: {
      wentBelowZero: 0,
      wentBelowZeroWinners: 0,
      endBelowZero: 0,
      belowZeroByReason: {},
      minReached: {},
      marks: {},
      marksWinners: {},
    },
    plots: {},
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
  addNumbers(agg.stockByRoundWinners, g.stockByRoundWinners);
  g.hospitalByRound.forEach((x, i) => {
    agg.hospitalByRound[i] = (agg.hospitalByRound[i] ?? 0) + (x ?? 0);
  });
  addNumbers(agg.influence, g.influence);
  addNumbers(agg.plots, g.plots);
  addNumbers(agg.monuments, g.monuments);
  addNumbers(agg.combatTokens, g.combatTokens);
  addNumbers(agg.descent, g.descent);
}
