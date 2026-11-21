import {
  combatStrengths,
  getScores,
  type GameState,
  type PlayerId,
  type Phase,
} from '@vampire/core';
import {
  CHARACTERS,
  PRESTIGE_TRACK,
  REGION_ORDER,
  TRACKS,
  UPKEEP_TIERS,
  type Resources,
} from '@vampire/data';
import { WEIGHTS, type Weights } from './weights';

/** Какая доля партии ещё впереди (1 — начало, 0 — конец). */
export function futureShare(state: GameState): number {
  if (state.phase === 'gameOver') return 0;
  const inRound: Record<Phase, number> = {
    draft: 0,
    upgrade: 0.1,
    placement: 0.3,
    combat: 0.6,
    upkeep: 0.9,
    gameOver: 1,
  };
  const done = (state.round - 1 + inRound[state.phase]) / state.config.rounds;
  return Math.max(0, 1 - done);
}

/** Сколько раундов (вместе с текущим) у персонажа ещё есть, чтобы сработать. */
function roundsLeft(state: GameState): number {
  const current = state.phase === 'draft' || state.phase === 'upgrade' ? 1 : 0;
  return state.config.rounds - state.round + current;
}

/** ПО за отметки и доля пути к следующей отметке трека. */
function trackValue(value: number, marks: readonly number[], w: Weights): number {
  const reached = marks.filter((m) => value >= m).length;
  const next = marks.find((m) => m > value);
  if (next === undefined) return reached;
  const prev = [...marks].reverse().find((m) => m <= value) ?? 0;
  return reached + (w.markPartial * (value - prev)) / (next - prev);
}

function endPrestige(upkeep: number): number {
  return UPKEEP_TIERS.find((t) => t.upkeep === upkeep)?.endPrestige ?? 0;
}

/** Ценность ресурсов в «золоте»; кровь сверх будущего содержания — дешевле. */
function resourceValue(r: Resources, bloodNeed: number, w: Weights): number {
  const fullBlood = Math.min(r.blood, bloodNeed + w.bloodReserve);
  const surplus = r.blood - fullBlood;
  return (
    r.gold * w.resource.gold +
    (fullBlood + surplus * w.bloodSurplus) * w.resource.blood +
    r.ore * w.resource.ore +
    r.compromat * w.resource.compromat
  );
}

/** Вероятность победы в бою по разнице сил. */
function winChance(diff: number, w: Weights): number {
  return 1 / (1 + Math.exp(-w.combatSharpness * diff));
}

/** Абсолютная ценность позиции игрока в «ПО». */
export function playerValue(state: GameState, player: PlayerId, w: Weights = WEIGHTS): number {
  const p = state.players[player];
  if (!p) return 0;
  const future = futureShare(state);
  const scores = getScores(state);
  const score = scores.find((s) => s.player === player);
  if (state.phase === 'gameOver') {
    return (score?.vp ?? 0) + (score?.rank === 1 ? w.winBonus : 0) + (score?.prestige ?? 0) * 0.01;
  }

  // Влияние и первенство: ПО по позициям уже в getScores, сверху — продвижение к отметкам.
  let value = score?.firstVp ?? 0;
  for (const region of REGION_ORDER) {
    const marks = TRACKS[region].vpMarks;
    value += trackValue(p.influence[region], marks, w) * Math.min(1, 0.5 + future);
  }

  // Престиж с учётом будущего престижа за персонажей.
  const own = state.workers.filter((w) => w.owner === player);
  const characters = [
    ...own.flatMap((w) => (w.character ? [w.character] : [])),
    ...(p.draftPick.character ? [p.draftPick.character] : []),
  ];
  const expectedPrestige = characters.reduce(
    (s, c) => s + w.keepCharacter * endPrestige(CHARACTERS[c].upkeep),
    0,
  );
  value += trackValue(
    Math.min(PRESTIGE_TRACK.max, p.prestige + expectedPrestige),
    PRESTIGE_TRACK.vpMarks,
    w,
  );

  // Кровь на содержание до конца партии: своих персонажей и взятого на драфте.
  const rounds = roundsLeft(state);
  const upkeepPerRound =
    own.reduce((s, x) => s + (x.character ? CHARACTERS[x.character].upkeep : 0), 0) +
    (p.draftPick.character ? CHARACTERS[p.draftPick.character].upkeep : 0);
  const bloodNeed = upkeepPerRound * Math.max(1, rounds);

  // Ресурсы теряют цену к концу партии.
  value +=
    resourceValue(p.resources, bloodNeed, w) *
    w.goldToVp *
    (w.resourceFloor + (1 - w.resourceFloor) * future);

  // Персонажи и профессии работают каждый раунд; содержание — плата за раунд. Если кровь в
  // избытке, содержание обходится дешевле: платим кровью, которую больше не на что тратить.
  const marginalBlood = p.resources.blood > bloodNeed + w.bloodReserve ? w.bloodSurplus : 1;
  const bloodVp = w.resource.blood * w.goldToVp * marginalBlood;
  for (const worker of own) {
    if (worker.character === null) continue;
    const prof = worker.profession === 'spy' ? w.spyPerRound : w.professionPerRound;
    value += rounds * (w.characterPerRound + prof - CHARACTERS[worker.character].upkeep * bloodVp);
  }
  if (p.draftPick.character) {
    value += rounds * (w.characterPerRound - CHARACTERS[p.draftPick.character].upkeep * bloodVp);
  }

  // Нехватка крови на содержание в конце раунда.
  if (state.phase !== 'upkeep') {
    const upkeep = own.reduce((s, w) => s + (w.character ? CHARACTERS[w.character].upkeep : 0), 0);
    value -= Math.max(0, upkeep - p.resources.blood) * w.upkeepShortage;
  }

  // Бои этого раунда, которые ещё впереди.
  if (state.phase === 'placement' || state.phase === 'combat') {
    for (const region of REGION_ORDER) {
      if (region in state.combatWinners) continue;
      const strengths = combatStrengths(state, region);
      const mine = strengths.find((s) => s.player === player);
      if (!mine) continue;
      const rivals = strengths.filter((s) => s.player !== player);
      const chance =
        rivals.length === 0
          ? w.combatUncontested
          : winChance(mine.strength - Math.max(...rivals.map((s) => s.strength)), w);
      value += chance * w.combatWinValue;
    }
  }

  // Здания приносят пользу до конца партии.
  for (const b of state.buildings) {
    if (b.owner === player) value += w.building[b.type] * future;
  }

  // Ходы впереди: рабочие в запасе во время размещения.
  if (state.phase === 'placement' && !p.passed) {
    value += own.filter((w) => w.position.kind === 'reserve').length * w.reserveWorker;
  }

  // Жетоны боя в руке.
  const hand = p.combatTokens.hand;
  value += (hand.attack + 2 * hand.massacre + hand.defense) * w.combatTokenStrength;
  return value;
}

/** Оценка для игрока: своя ценность против сильнейшего и среднего соперника. */
export function evaluate(state: GameState, player: PlayerId, w: Weights = WEIGHTS): number {
  const values = state.players.map((_, i) => playerValue(state, i, w));
  const mine = values[player] ?? 0;
  const rivals = values.filter((_, i) => i !== player);
  if (rivals.length === 0) return mine;
  const best = Math.max(...rivals);
  const mean = rivals.reduce((a, b) => a + b, 0) / rivals.length;
  return mine - w.versusBest * best - w.versusMean * mean;
}
