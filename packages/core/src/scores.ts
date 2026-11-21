import { PRESTIGE_TRACK, REGION_ORDER, TRACKS } from '@vampire/data';
import { ownsCitadel } from './buildings';
import type { GameState, PlayerId } from './types';

/** Очки игрока и из чего они сложились. */
export interface PlayerScore {
  player: PlayerId;
  /** Итого ПО. */
  vp: number;
  /** ПО за отметки трека престижа. */
  prestigeVp: number;
  /** ПО за отметки треков влияния по текущим позициям. */
  influenceVp: number;
  /** ПО за жетоны первенства. */
  firstVp: number;
  prestige: number;
  /** Место после тай-брейка: 1 — победитель; при полной ничьей места совпадают. */
  rank: number;
}

function compareForRank(state: GameState, a: PlayerScore, b: PlayerScore): number {
  if (a.vp !== b.vp) return b.vp - a.vp;
  if (a.prestige !== b.prestige) return b.prestige - a.prestige;
  // Владелец Цитадели Города, если она есть у одного из сравниваемых; иначе ничья.
  const ca = ownsCitadel(state, a.player, 'city');
  const cb = ownsCitadel(state, b.player, 'city');
  return ca === cb ? 0 : ca ? -1 : 1;
}

/**
 * ПО = отметки престижа + отметки влияния по позициям + жетоны первенства.
 * Тай-брейк: ПО → престиж → владелец Цитадели Города. Можно вызывать и посреди партии.
 */
export function getScores(state: GameState): PlayerScore[] {
  const scores: PlayerScore[] = state.players.map((p, player) => {
    const prestigeVp = PRESTIGE_TRACK.vpMarks.filter((m) => p.prestige >= m).length;
    const influenceVp = REGION_ORDER.reduce(
      (s, r) => s + TRACKS[r].vpMarks.filter((m) => p.influence[r] >= m).length,
      0,
    );
    const firstVp = REGION_ORDER.filter((r) => state.firstToMax[r] === player).length;
    return {
      player,
      vp: prestigeVp + influenceVp + firstVp,
      prestigeVp,
      influenceVp,
      firstVp,
      prestige: p.prestige,
      rank: 0,
    };
  });
  for (const s of scores) {
    s.rank = 1 + scores.filter((o) => compareForRank(state, o, s) < 0).length;
  }
  return scores;
}
