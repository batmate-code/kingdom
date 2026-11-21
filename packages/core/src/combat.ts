import { BASE_WORKER_STRENGTH, COMBAT_REWARD, PROFESSIONS, type RegionId } from '@vampire/data';
import { countsInCombat } from './board';
import type { Ctx } from './context';
import { changeInfluence } from './economy';
import type { CombatStrength, GameState, PlayerId } from './types';

/**
 * Участники боя — игроки, у которых в регионе есть хотя бы 1 рабочий в первом слоте или у
 * места Цитадели (ответ автора по OQ-3: рабочие во вторых слотах в бою не участвуют).
 * Сила = эти рабочие (по силе профессии) + жетоны силы.
 * Склепы, Цитадель, Комиссариат и жетоны боя добавятся на этапах 3–4.
 */
export function combatStrengths(state: GameState, region: RegionId): CombatStrength[] {
  const out: CombatStrength[] = [];
  for (let player = 0; player < state.players.length; player++) {
    const counted = state.workers.filter((w) => w.owner === player && countsInCombat(w, region));
    if (counted.length === 0) continue;
    const workerStrength = counted.reduce(
      (s, w) =>
        s + (w.profession ? PROFESSIONS[w.profession].combatStrength : BASE_WORKER_STRENGTH),
      0,
    );
    const tokens = state.powerTokens
      .filter((t) => t.owner === player && t.region === region)
      .reduce((s, t) => s + t.count, 0);
    out.push({ player, strength: workerStrength + tokens, workers: counted.length });
  }
  return out;
}

/** Побеждает максимальная сила; при равенстве — больше рабочих; иначе победителя нет. */
export function combatWinner(
  state: GameState,
  strengths: readonly CombatStrength[],
): PlayerId | null {
  if (strengths.length === 0) return null;
  const best = [...strengths].sort((a, b) => b.strength - a.strength || b.workers - a.workers);
  const top = best[0] as CombatStrength;
  const second = best[1];
  if (second && second.strength === top.strength && second.workers === top.workers) return null;
  return top.player;
}

export function resolveCombat(c: Ctx, region: RegionId): void {
  const strengths = combatStrengths(c.draft, region);
  const winner = combatWinner(c.draft, strengths);
  c.events.push({ type: 'combatResolved', region, strengths, winner });
  if (winner === null) return;
  changeInfluence(c, winner, region, COMBAT_REWARD.influence);
  c.draft.pending = { kind: 'combatReward', player: winner, region };
}

/** Награда на выбор: ещё +1 влияние (право стройки появится на этапе 4). */
export function applyCombatReward(c: Ctx, player: PlayerId, region: RegionId): void {
  changeInfluence(c, player, region, COMBAT_REWARD.bonusInfluence);
}
