import { CHARACTERS, PRESTIGE_TRACK, UPKEEP_TIERS, type CharacterId } from '@vampire/data';
import type { Ctx } from './context';
import type { PlayerId, PrestigeReason } from './types';

/** Двинуть престиж по треку (не выше 40). */
export function addPrestige(
  c: Ctx,
  player: PlayerId,
  amount: number,
  reason: PrestigeReason,
): void {
  const p = c.draft.players[player];
  if (!p || amount === 0) return;
  const from = p.prestige;
  p.prestige = Math.min(PRESTIGE_TRACK.max, from + amount);
  if (p.prestige !== from) {
    c.events.push({ type: 'prestigeChanged', player, from, to: p.prestige, reason });
  }
}

function endPrestige(character: CharacterId): number {
  const upkeep = CHARACTERS[character].upkeep;
  return UPKEEP_TIERS.find((t) => t.upkeep === upkeep)?.endPrestige ?? 0;
}

/**
 * Конец игры: престиж за персонажей, оставшихся у рабочих (содержание за 6-й раунд уже оплачено —
 * неоплаченные сброшены). Сначала престиж, потом пересчёт в ПО [интерпретация в правилах].
 */
export function awardCharacterPrestige(c: Ctx): void {
  for (const w of c.draft.workers) {
    if (w.character !== null) addPrestige(c, w.owner, endPrestige(w.character), 'character');
  }
}
