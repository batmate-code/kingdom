import {
  BASE_WORKER_STRENGTH,
  BUILDING_EFFECTS,
  COMBAT_REWARD,
  COMBAT_TOKENS,
  COMBAT_TOKEN_ORDER,
  COMBAT_TOKENS_REFRESH_AFTER_ROUND,
  LOCATION_ORDER,
  LOCATIONS,
  COMBAT_TOKENS_SIX_COUNT,
  COMBAT_TOKENS_SIX_DECOYS,
  COMBAT_TOKENS_SIX_REFRESH_EVERY,
  COMMISSARIAT_STRENGTH_PER_WORKER,
  DEFENSE_COUNTER_BONUS,
  PLOTS,
  PROFESSIONS,
  REGION_ORDER,
  REVERSE_TRACK,
  type CombatTokenId,
  type LocationId,
  type RegionId,
  type SlotIndex,
} from '@vampire/data';
import { countsInCombat, regionOfWorker } from './board';
import type { RuleToggles } from './config';
import type { Ctx } from './context';
import { turnOrder } from './draft';
import { changeInfluence, changeResources } from './economy';
import { influenceMin, isReverse, monumentAt, ownsSpire } from './reverse';
import type { CombatPlay, CombatStrength, GameState, PlayerId, Worker } from './types';

function workerStrength(w: Worker): number {
  return w.profession ? PROFESSIONS[w.profession].combatStrength : BASE_WORKER_STRENGTH;
}

/** Действие жетонов боя после вскрытия: прибавка к силе, Отступление, Доминирование. */
export interface TokenEffect {
  bonus: number;
  /**
   * Отступление сыграно и не отменено Доминированием соперника: игрок проигрывает бой.
   * Переносить рабочих есть куда, только если боёв впереди ещё не было (не в Городе).
   */
  retreats: boolean;
  domination: boolean;
}

/**
 * Защита отменяет Резню соперника, Доминирование — Отступление соперника.
 * OQ-22 (автор): при нескольких соперниках отменяется Резня (Отступление) каждого из них.
 */
export function tokenEffects(plays: readonly CombatPlay[]): Map<PlayerId, TokenEffect> {
  const byOpponent = (player: PlayerId, token: CombatTokenId) =>
    plays.some((p) => p.player !== player && p.token === token);
  const out = new Map<PlayerId, TokenEffect>();
  for (const { player, token } of plays) {
    const massacreCancelled = token === 'massacre' && byOpponent(player, 'defense');
    // Автор 23.11: Защита даёт силу, только если отменила Резню соперника.
    const counter =
      token === 'defense' && byOpponent(player, 'massacre') ? DEFENSE_COUNTER_BONUS : 0;
    out.set(player, {
      bonus: massacreCancelled ? 0 : COMBAT_TOKENS[token].strength + counter,
      retreats: token === 'retreat' && !byOpponent(player, 'domination'),
      domination: token === 'domination',
    });
  }
  return out;
}

/** Сила жетона Комиссариата (автор 23.11): по COMMISSARIAT_STRENGTH_PER_WORKER за каждого рабочего в госпитале. */
export function hospitalStrength(state: GameState): number {
  return (
    state.workers.filter((w) => w.position.kind === 'hospital').length *
    COMMISSARIAT_STRENGTH_PER_WORKER
  );
}

/**
 * Склепы: +1 за каждый свой Склеп региона, рядом с которым (в соседней локации) стоит твой
 * рабочий. Рабочие у места Цитадели в локации не стоят. Второй слот — OQ-25.
 */
export function cryptStrength(state: GameState, player: PlayerId, region: RegionId): number {
  const secondSlot = state.config.rules.cryptCountsSecondSlot;
  const occupied = new Set(
    state.workers.flatMap((w) =>
      w.owner === player && w.position.kind === 'slot' && (w.position.slot === 1 || secondSlot)
        ? [w.position.location]
        : [],
    ),
  );
  let count = 0;
  for (const b of state.buildings) {
    if (b.type !== 'crypt' || b.owner !== player || b.region !== region || b.plot === null) {
      continue;
    }
    const plot = PLOTS.find((p) => p.id === b.plot);
    if (plot?.adjacent.some((loc) => occupied.has(loc))) count += 1;
  }
  return count * BUILDING_EFFECTS.cryptStrength;
}

/**
 * Участники боя — игроки, у которых в регионе есть рабочий в первом слоте или у места Цитадели
 * (OQ-3). Владелец жетона Комиссариата без своих рабочих — OQ-24.
 */
export function combatParticipants(state: GameState, region: RegionId): PlayerId[] {
  const out: PlayerId[] = [];
  for (let player = 0; player < state.players.length; player++) {
    // Автор 23.11: участвует любой свой рабочий региона (и во втором слоте); сила — по первым слотам.
    const hasWorker = state.workers.some((w) => w.owner === player && regionOfWorker(w) === region);
    const viaCommissariat =
      state.config.rules.commissariatWithoutWorkers &&
      state.commissariat?.owner === player &&
      state.commissariat.region === region;
    if (hasWorker || viaCommissariat) out.push(player);
  }
  return out;
}

/**
 * Сила игроков в бою региона = рабочие (Шпион 2) + жетоны силы + Склепы + Цитадель Леса +
 * жетон Комиссариата + вскрытый жетон боя. Отступившие (`excluded`) в бою не участвуют.
 */
export function combatStrengths(
  state: GameState,
  region: RegionId,
  excluded: readonly PlayerId[] = [],
  opts: { commissariat?: boolean } = {},
): CombatStrength[] {
  const combat = state.combat?.region === region && state.combat.revealed ? state.combat : null;
  const effects = tokenEffects(combat?.plays ?? []);
  const out: CombatStrength[] = [];
  for (const player of combatParticipants(state, region)) {
    if (excluded.includes(player)) continue;
    const counted = state.workers.filter((w) => w.owner === player && countsInCombat(w, region));
    let strength = counted.reduce((s, w) => s + workerStrength(w), 0);
    strength += state.powerTokens
      .filter((t) => t.owner === player && t.region === region)
      .reduce((s, t) => s + t.count, 0);
    strength += cryptStrength(state, player, region);
    // Эксперимент influenceModel=reverse: постоянная сила отметки −3; у Шпиля нет силы Леса.
    strength += state.players[player]?.undergroundStrength[region] ?? 0;
    if (
      !isReverse(state) &&
      region === 'forest' &&
      state.buildings.some((b) => b.type === 'citadel' && b.owner === player && b.region === region)
    ) {
      strength += BUILDING_EFFECTS.forestCitadelStrength;
    }
    if (
      opts.commissariat !== false &&
      state.commissariat?.owner === player &&
      state.commissariat.region === region
    ) {
      strength += hospitalStrength(state);
    }
    strength += effects.get(player)?.bonus ?? 0;
    out.push({ player, strength, workers: counted.length });
  }
  return out;
}

/** Побеждает максимальная сила; при равенстве — больше рабочих; иначе победителя нет. */
export function combatWinner(strengths: readonly CombatStrength[]): PlayerId | null {
  if (strengths.length === 0) return null;
  const best = [...strengths].sort((a, b) => b.strength - a.strength || b.workers - a.workers);
  const top = best[0] as CombatStrength;
  const second = best[1];
  if (second && second.strength === top.strength && second.workers === top.workers) return null;
  return top.player;
}

/** Регионы, где боя в этом раунде ещё не было (после `region`). */
export function laterRegions(region: RegionId): RegionId[] {
  return REGION_ORDER.slice(REGION_ORDER.indexOf(region) + 1);
}

/**
 * Перед боями: Шпионы на поле по очереди с первого игрока решают, перейти ли в другой регион.
 * Шпионы одного игрока решают подряд, за всех сразу (OQ-26, автор).
 */
export function startSpyMoves(c: Ctx): void {
  const d = c.draft;
  const tasks = turnOrder(d).flatMap((player) =>
    d.workers
      .filter((w) => w.owner === player && w.profession === 'spy' && w.position.kind === 'slot')
      .map((w) => ({ t: 'askSpyMove' as const, player, workerId: w.id })),
  );
  d.tasks.unshift(...tasks);
}

/**
 * Куда может перейти Шпион (автор 23.11, 24.11): игрок выбирает регион, локацию и слот, как при
 * выставлении, — любой свободный слот своего или другого региона (второй — если не закрыт замком);
 * свободных слотов нет — в этот регион перейти нельзя.
 */
export function spyDestinations(
  state: GameState,
  workerId: string,
): { region: RegionId; location: LocationId; slot: SlotIndex }[] {
  const w = state.workers.find((x) => x.id === workerId);
  const here = w ? regionOfWorker(w) : null;
  if (!w || here === null || w.position.kind !== 'slot') return [];
  const out: { region: RegionId; location: LocationId; slot: SlotIndex }[] = [];
  for (const location of LOCATION_ORDER) {
    const region = LOCATIONS[location].region;
    for (const slot of [1, 2] as const) {
      if (slot === 2 && state.locations[location].slot2Locked) continue;
      const taken = state.workers.some(
        (x) =>
          x.position.kind === 'slot' &&
          x.position.location === location &&
          x.position.slot === slot,
      );
      if (!taken) out.push({ region, location, slot });
    }
  }
  return out;
}

function moveToCitadelSpot(c: Ctx, w: Worker, to: RegionId, method: 'spy' | 'retreat'): void {
  w.position = { kind: 'citadelSpot', region: to };
  c.events.push({ type: 'workerMoved', player: w.owner, workerId: w.id, to, method });
}

/** Шпион бесплатно встаёт в свободный первый слот локации другого региона и освобождает свой. */
export function applySpyMove(
  c: Ctx,
  workerId: string,
  to: RegionId | null,
  location: LocationId | undefined,
  slot: SlotIndex | undefined,
): void {
  if (to === null) return;
  const w = c.draft.workers.find((x) => x.id === workerId);
  const ok = spyDestinations(c.draft, workerId).some(
    (d) => d.region === to && d.location === location && d.slot === slot,
  );
  if (!w || !ok || location === undefined || slot === undefined) {
    throw new Error(`Шпион ${workerId} не может перейти в ${location ?? to}`);
  }
  w.position = { kind: 'slot', location, slot };
  c.events.push({ type: 'workerMoved', player: w.owner, workerId: w.id, to, method: 'spy' });
}

/**
 * Бой региона, шаг 1: каждый участник с жетонами в руке кладёт один в закрытую
 * (по очереди с первого игрока; соперники видят только факт хода). Без соперников — OQ-23.
 */
export function startCombat(c: Ctx, region: RegionId): void {
  const d = c.draft;
  d.combat = { region, plays: [], revealed: false };
  const participants = combatParticipants(d, region);
  const play = participants.length >= 2 || d.config.rules.combatTokensWithoutOpponents;
  const asks = play
    ? turnOrder(d)
        .filter((p) => participants.includes(p) && combatTokenOptions(d, p).length > 0)
        .map((player) => ({ t: 'askCombatToken' as const, player, region }))
    : [];
  // Наёмник: до жетонов боя участники с жетонами на карте решают, выложить ли их сюда.
  const garrisons = turnOrder(d)
    .filter((p) => participants.includes(p) && garrisonOf(d, p, region) > 0)
    .map((player) => ({ t: 'askGarrison' as const, player, region }));
  d.tasks.unshift(
    ...garrisons,
    ...asks,
    { t: 'revealCombat', region },
    { t: 'combatOutcome', region },
  );
}

/** Сколько жетонов силы у игрока на картах Наёмников. */
// Автор 24.11: жетоны выкладываются только в бой региона, где стоит сам Наёмник.
export function garrisonOf(state: GameState, player: PlayerId, region: RegionId): number {
  return state.workers
    .filter((w) => w.owner === player && regionOfWorker(w) === region)
    .reduce((s, w) => s + (w.garrison ?? 0), 0);
}

/** Наёмник: все жетоны с карт игрока — жетонами силы в регион боя (до конца раунда). */
export function deployGarrison(c: Ctx, player: PlayerId, region: RegionId): void {
  const count = garrisonOf(c.draft, player, region);
  if (count === 0) return;
  for (const w of c.draft.workers) {
    if (w.owner === player && regionOfWorker(w) === region) delete w.garrison;
  }
  const existing = c.draft.powerTokens.find((t) => t.owner === player && t.region === region);
  if (existing) existing.count += count;
  else c.draft.powerTokens.push({ owner: player, region, count });
  c.events.push({ type: 'garrisonDeployed', player, region, count });
}

/**
 * Жетоны, которые игрок может положить в идущем бою. Доминацию нельзя играть, если в регионе
 * сейчас нет соперников (автор, 23.11).
 */
export function combatTokenOptions(state: GameState, player: PlayerId): CombatTokenId[] {
  const hand = state.players[player]?.combatTokens.hand;
  if (!hand) return [];
  const region = state.combat?.region;
  const alone = region !== undefined && combatParticipants(state, region).length <= 1;
  return COMBAT_TOKEN_ORDER.filter((t) => hand[t] > 0 && !(alone && t === 'domination'));
}

/** Жетоны, которыми можно спуститься в минус (эксперимент influenceModel=reverse), и предел. */
export function lossMax(token: CombatTokenId): number | null {
  if (token === 'decoy') return REVERSE_TRACK.decoyInfluenceLossMax;
  if (token === 'retreat') return REVERSE_TRACK.retreatInfluenceLossMax;
  return null;
}

/**
 * Эксперимент influenceModel=reverse: сколько влияния можно решить потерять при вскрытии
 * жетона `token` (Приманка до 1, Отступление до 2), но не ниже нижнего предела трека.
 */
export function decoyLosses(
  state: GameState,
  player: PlayerId,
  region: RegionId,
  token: CombatTokenId = 'decoy',
): number[] {
  const room = (state.players[player]?.influence[region] ?? 0) - influenceMin(state);
  const max = Math.min(lossMax(token) ?? 0, Math.max(0, room));
  return Array.from({ length: max + 1 }, (_, i) => i);
}

export function applyCombatToken(
  c: Ctx,
  player: PlayerId,
  token: CombatTokenId,
  influenceLoss?: number,
): void {
  const combat = c.draft.combat;
  if (!combat) throw new Error('Бой не идёт');
  if (influenceLoss !== undefined) {
    if (
      lossMax(token) === null ||
      !decoyLosses(c.draft, player, combat.region, token).includes(influenceLoss)
    ) {
      throw new Error(
        'Потеря влияния выбирается только с Приманкой в эксперименте обратных треков',
      );
    }
    combat.plays.push({ player, token, influenceLoss });
  } else combat.plays.push({ player, token });
  c.events.push({ type: 'combatTokenPlayed', player, region: combat.region });
}

/**
 * Шаг 2: жетоны вскрываются одновременно и уходят из руки в сброс. Отступающие (если боёв
 * впереди нет — в Городе — просто проигрывают) выбирают регион, где боя ещё не было.
 */
export function revealCombat(c: Ctx, region: RegionId): void {
  const d = c.draft;
  const combat = d.combat;
  if (!combat) throw new Error('Бой не идёт');
  combat.revealed = true;
  if (combat.plays.length === 0) return;
  for (const { player, token } of combat.plays) {
    const p = d.players[player];
    if (!p) throw new Error(`Нет игрока ${player}`);
    p.combatTokens.hand[token] -= 1;
    p.combatTokens.discard[token] += 1;
  }
  c.events.push({
    type: 'combatTokensRevealed',
    region,
    plays: combat.plays.map((p) => ({ ...p })),
  });
  // Эксперимент influenceModel=reverse: Приманка и Отступление снимают выбранное влияние.
  if (isReverse(d)) {
    for (const { player, token, influenceLoss } of combat.plays) {
      if (influenceLoss) {
        changeInfluence(
          c,
          player,
          region,
          -influenceLoss,
          token === 'retreat' ? 'retreat' : 'decoy',
        );
      }
    }
  }
  if (laterRegions(region).length === 0) return;
  // Владельцу жетона Комиссариата без рабочих в регионе (OQ-24) переносить некого.
  const effects = tokenEffects(combat.plays);
  const asks = turnOrder(d)
    .filter(
      (player) =>
        effects.get(player)?.retreats &&
        d.workers.some((w) => w.owner === player && regionOfWorker(w) === region),
    )
    .map((player) => ({ t: 'askRetreat' as const, player, region }));
  d.tasks.unshift(...asks);
}

/** Отступление: все рабочие игрока из региона (и из вторых слотов) — к месту Цитадели `to`. */
export function applyRetreat(c: Ctx, player: PlayerId, region: RegionId, to: RegionId): void {
  if (!laterRegions(region).includes(to)) throw new Error(`Нельзя отступить в ${to}`);
  for (const w of c.draft.workers) {
    if (w.owner === player && regionOfWorker(w) === region) moveToCitadelSpot(c, w, to, 'retreat');
  }
}

/** Шаг 3: победитель (отступившие проиграли) и награда; Доминирование даёт +1 влияние. */
export function combatOutcome(c: Ctx, region: RegionId): void {
  const d = c.draft;
  const effects = tokenEffects(d.combat?.plays ?? []);
  const retreated = [...effects].flatMap(([player, e]) => (e.retreats ? [player] : []));
  const strengths = combatStrengths(d, region, retreated);
  const winner = combatWinner(strengths);
  c.events.push({ type: 'combatResolved', region, strengths, winner });
  d.combat = null;
  d.combatWinners[region] = winner;
  if (winner === null) return;
  // Обелиск: владелец получает компромат, когда бой в его регионе выигрывает соперник.
  const monument = isReverse(d) ? monumentAt(d, region) : null;
  if (monument?.type === 'obelisk' && monument.owner !== winner) {
    changeResources(
      c,
      monument.owner,
      { compromat: REVERSE_TRACK.obeliskCompromatPerRivalWin },
      'obelisk',
    );
  }
  // Владелец Шпиля выбирает награду целиком (влияние или ПО), поэтому базовое +1 — при выборе.
  if (!ownsSpire(d, winner, region)) {
    changeInfluence(c, winner, region, COMBAT_REWARD.influence, 'combat');
  }
  if (effects.get(winner)?.domination) {
    changeInfluence(c, winner, region, COMBAT_REWARD.dominationInfluence, 'domination');
  }
  d.pending = { kind: 'combatReward', player: winner, region };
}

/** Награда на выбор: ещё +1 влияние или право построить здание в этом регионе. */
export function applyCombatReward(
  c: Ctx,
  player: PlayerId,
  region: RegionId,
  choice: 'influence' | 'build' | 'vp',
): void {
  const spire = ownsSpire(c.draft, player, region);
  if (choice === 'vp') {
    if (!spire) throw new Error('ПО вместо награды — только у владельца Шпиля региона');
    const p = c.draft.players[player];
    if (!p) throw new Error(`Нет игрока ${player}`);
    p.bonusVp += REVERSE_TRACK.spireVp;
    c.events.push({ type: 'spireVp', player, region, vp: REVERSE_TRACK.spireVp });
    return;
  }
  // Владельцу Шпиля базовое +1 влияние не начислено в combatOutcome — начисляем здесь.
  if (spire) changeInfluence(c, player, region, COMBAT_REWARD.influence, 'combat');
  if (choice === 'influence') {
    changeInfluence(c, player, region, COMBAT_REWARD.bonusInfluence, 'combatBonus');
  } else c.draft.tasks.unshift({ t: 'askBuild', player, source: { kind: 'reward', region } });
}

/** Сколько жетонов вида `t` в наборе игрока (переключатель `combatTokenSet`). */
export function combatTokenCount(rules: RuleToggles, t: CombatTokenId): number {
  if (rules.combatTokenSet !== 'six') return COMBAT_TOKENS[t].count;
  return t === 'decoy' ? COMBAT_TOKENS_SIX_DECOYS : COMBAT_TOKENS_SIX_COUNT;
}

/** Возвращается ли сброс жетонов боя в руку в конце раунда `round`. */
export function combatTokensRefreshAfter(rules: RuleToggles, round: number): boolean {
  return rules.combatTokenSet === 'six'
    ? round % COMBAT_TOKENS_SIX_REFRESH_EVERY === 0
    : round === COMBAT_TOKENS_REFRESH_AFTER_ROUND;
}

/** Конец 3-го раунда (или каждого 2-го при `combatTokenSet=six`): весь набор возвращается в руку. */
export function refreshCombatTokens(c: Ctx): void {
  for (const p of c.draft.players) {
    for (const t of COMBAT_TOKEN_ORDER) {
      p.combatTokens.hand[t] += p.combatTokens.discard[t];
      p.combatTokens.discard[t] = 0;
    }
  }
  c.events.push({ type: 'combatTokensRefreshed' });
}
