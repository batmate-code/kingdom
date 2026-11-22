import { CHARACTER_ORDER, COMBAT_TOKEN_ORDER, type CharacterId } from '@vampire/data';
import { randomInt, seedToState, shuffleInPlace } from './rng';
import type { GameState, Observation } from './types';

/**
 * Правдоподобное полное состояние по наблюдению игрока (для ботов, которые примеряют ходы,
 * и для ISMCTS). Скрытое раскладывается случайно по seed:
 * - колода — невидимые игроку карты в случайном порядке;
 * - закрытые жетоны боя соперников — случайный жетон из их руки (рука открыта);
 * - генератор случайных чисел — новый.
 * Всё открытое берётся из наблюдения как есть. Проверка инвариантов выключена: это черновик для
 * перебора, а не настоящая партия.
 */
export function determinize(obs: Observation, seed: number): GameState {
  const holder = { rng: seedToState(seed) };

  const seen = new Set<CharacterId>([
    ...obs.discard,
    ...obs.offer.characters,
    ...obs.players.flatMap((p) => (p.draftPick.character ? [p.draftPick.character] : [])),
    ...obs.workers.flatMap((w) => (w.character ? [w.character] : [])),
  ]);
  const deck = CHARACTER_ORDER.filter((c) => !seen.has(c));
  shuffleInPlace(holder, deck);

  const combat = obs.combat && {
    region: obs.combat.region,
    revealed: obs.combat.revealed,
    plays: obs.combat.plays.map(({ player, token }) => {
      if (token !== null) return { player, token };
      const hand = obs.players[player]?.combatTokens.hand;
      const pool = COMBAT_TOKEN_ORDER.flatMap((t) =>
        Array.from({ length: hand?.[t] ?? 0 }, () => t),
      );
      const guess = pool[randomInt(holder, pool.length)];
      if (!guess) throw new Error(`У игрока ${player} нет жетонов боя для догадки`);
      return { player, token: guess };
    }),
  };

  return {
    config: { ...obs.config, checkInvariants: false },
    round: obs.round,
    firstPlayer: obs.firstPlayer,
    phase: obs.phase,
    players: obs.players,
    workers: obs.workers,
    locations: obs.locations,
    lair: obs.lair,
    cityEntryRaisedRegions: obs.cityEntryRaisedRegions,
    firstToMax: obs.firstToMax,
    powerTokens: obs.powerTokens,
    commissariat: obs.commissariat,
    buildings: obs.buildings,
    combat,
    combatWinners: obs.combatWinners,
    cardStash: obs.cardStash,
    blocks: obs.blocks,
    alchemy: obs.alchemy,
    placementCurrent: obs.placementCurrent,
    deck: deck.slice(0, obs.deckSize),
    discard: obs.discard,
    offer: obs.offer,
    professionPool: obs.professionPool,
    tasks: obs.tasks,
    pending: obs.pending,
    rng: holder.rng,
  };
}
