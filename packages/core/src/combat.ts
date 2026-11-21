import {
  BASE_WORKER_STRENGTH,
  BUILDING_EFFECTS,
  COMBAT_REWARD,
  COMBAT_TOKENS,
  COMBAT_TOKEN_ORDER,
  PLOTS,
  PROFESSIONS,
  REGION_ORDER,
  type CombatTokenId,
  type RegionId,
} from '@vampire/data';
import { countsInCombat, regionOfWorker } from './board';
import type { Ctx } from './context';
import { turnOrder } from './draft';
import { changeInfluence } from './economy';
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
    out.set(player, {
      bonus: massacreCancelled ? 0 : COMBAT_TOKENS[token].strength,
      retreats: token === 'retreat' && !byOpponent(player, 'domination'),
      domination: token === 'domination',
    });
  }
  return out;
}

/** Сила всех рабочих в общем госпитале (для жетона Комиссариата; Шпион — 2). */
export function hospitalStrength(state: GameState): number {
  return state.workers
    .filter((w) => w.position.kind === 'hospital')
    .reduce((s, w) => s + workerStrength(w), 0);
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
    const hasWorker = state.workers.some((w) => w.owner === player && countsInCombat(w, region));
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
    if (
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

function handSize(state: GameState, player: PlayerId): number {
  const hand = state.players[player]?.combatTokens.hand;
  return hand ? COMBAT_TOKEN_ORDER.reduce((s, t) => s + hand[t], 0) : 0;
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

export function spyDestinations(state: GameState, workerId: string): RegionId[] {
  const w = state.workers.find((x) => x.id === workerId);
  const here = w ? regionOfWorker(w) : null;
  if (!w || here === null || w.position.kind !== 'slot') return [];
  return REGION_ORDER.filter((r) => r !== here);
}

function moveToCitadelSpot(c: Ctx, w: Worker, to: RegionId, method: 'spy' | 'retreat'): void {
  w.position = { kind: 'citadelSpot', region: to };
  c.events.push({ type: 'workerMoved', player: w.owner, workerId: w.id, to, method });
}

/** Шпион уходит к месту Цитадели другого региона бесплатно и освобождает свой слот. */
export function applySpyMove(c: Ctx, workerId: string, to: RegionId | null): void {
  if (to === null) return;
  const w = c.draft.workers.find((x) => x.id === workerId);
  if (!w || !spyDestinations(c.draft, workerId).includes(to)) {
    throw new Error(`Шпион ${workerId} не может перейти в ${to}`);
  }
  moveToCitadelSpot(c, w, to, 'spy');
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
        .filter((p) => participants.includes(p) && handSize(d, p) > 0)
        .map((player) => ({ t: 'askCombatToken' as const, player, region }))
    : [];
  d.tasks.unshift(...asks, { t: 'revealCombat', region }, { t: 'combatOutcome', region });
}

export function combatTokenOptions(state: GameState, player: PlayerId): CombatTokenId[] {
  const hand = state.players[player]?.combatTokens.hand;
  return hand ? COMBAT_TOKEN_ORDER.filter((t) => hand[t] > 0) : [];
}

export function applyCombatToken(c: Ctx, player: PlayerId, token: CombatTokenId): void {
  const combat = c.draft.combat;
  if (!combat) throw new Error('Бой не идёт');
  combat.plays.push({ player, token });
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
  changeInfluence(c, winner, region, COMBAT_REWARD.influence, 'combat');
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
  choice: 'influence' | 'build',
): void {
  if (choice === 'influence') {
    changeInfluence(c, player, region, COMBAT_REWARD.bonusInfluence, 'combatBonus');
  } else c.draft.tasks.unshift({ t: 'askBuild', player, source: { kind: 'reward', region } });
}

/** Конец 3-го раунда: весь набор жетонов боя возвращается в руку. */
export function refreshCombatTokens(c: Ctx): void {
  for (const p of c.draft.players) {
    for (const t of COMBAT_TOKEN_ORDER) {
      p.combatTokens.hand[t] += p.combatTokens.discard[t];
      p.combatTokens.discard[t] = 0;
    }
  }
  c.events.push({ type: 'combatTokensRefreshed' });
}
