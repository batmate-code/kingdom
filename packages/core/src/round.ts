import {
  COMBAT_TOKENS_REFRESH_AFTER_ROUND,
  LAIR_STASH_PER_ROUND,
  LOCATION_ORDER,
  LOCATION_PROFESSION_TOKENS,
  REGION_ORDER,
  type LocationId,
  type ProfessionId,
} from '@vampire/data';
import { refreshCombatTokens } from './combat';
import type { Ctx } from './context';
import { clearOffer, dealDraft } from './draft';
import { canTakePlacementTurn } from './placement';
import { shuffleInPlace } from './rng';

/**
 * Подготовка раунда: открыто раздать жетоны профессий локаций, выложить драфт.
 * Дальше в очереди: драфт → улучшение → размещение.
 */
export function startRound(c: Ctx): void {
  const d = c.draft;
  d.phase = 'draft';
  c.events.push({ type: 'roundStarted', round: d.round, firstPlayer: d.firstPlayer });

  const tokens = [...LOCATION_PROFESSION_TOKENS];
  shuffleInPlace(d, tokens);
  const dealt = {} as Record<LocationId, ProfessionId>;
  LOCATION_ORDER.forEach((loc, i) => {
    const token = tokens[i] as ProfessionId;
    d.locations[loc].professionToken = token;
    dealt[loc] = token;
  });
  c.events.push({ type: 'professionTokensDealt', tokens: dealt });

  for (const p of d.players) p.passed = false;
  d.placementCurrent = d.firstPlayer;
  d.tasks.unshift(...dealDraft(c), { t: 'placementTurn', first: true });
}

/**
 * Передать ход размещения следующему по часовой стрелке игроку, который ещё может ходить.
 * Если таких нет — размещение окончено, начинаются бои.
 */
export function placementTurn(c: Ctx, first: boolean): void {
  const d = c.draft;
  d.phase = 'placement';
  const n = d.players.length;
  const start = first ? d.placementCurrent : d.placementCurrent + 1;
  for (let k = 0; k < n; k++) {
    const player = (start + k) % n;
    if (canTakePlacementTurn(d, player)) {
      d.placementCurrent = player;
      d.pending = { kind: 'placement', player };
      return;
    }
  }
  d.phase = 'combat';
  d.tasks.unshift(
    { t: 'spyMoves' },
    ...REGION_ORDER.map((region) => ({ t: 'combat' as const, region })),
    { t: 'startUpkeep' },
  );
}

/**
 * Конец раунда, часть 2: все рабочие возвращаются, снимаются жетоны силы и замки, пул Таверны
 * уходит в сброс, копилка Логова, переход первого игрока.
 */
export function finishRound(c: Ctx): void {
  const d = c.draft;
  for (const w of d.workers) w.position = { kind: 'reserve' };
  for (const loc of LOCATION_ORDER) d.locations[loc].slot2Locked = false;
  d.powerTokens = [];
  d.commissariat = null;
  if (d.round === COMBAT_TOKENS_REFRESH_AFTER_ROUND) refreshCombatTokens(c);
  clearOffer(c);
  if (!d.lair.visited) d.lair.stash += LAIR_STASH_PER_ROUND;
  d.lair.visited = false;
  c.events.push({ type: 'roundEnded', round: d.round });

  if (d.round >= d.config.rounds) {
    d.phase = 'gameOver';
    c.events.push({ type: 'gameOver' });
    return;
  }
  d.round += 1;
  d.firstPlayer = (d.firstPlayer + 1) % d.players.length;
  d.tasks.unshift({ t: 'startRound' });
}
