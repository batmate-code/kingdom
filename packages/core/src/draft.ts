import {
  CHARACTERS,
  DRAFT_BY_PLAYERS,
  GAME,
  PROFESSION_ORDER,
  UPKEEP_TIERS,
  type CharacterId,
  type ProfessionId,
  type UpkeepTier,
} from '@vampire/data';
import { distinctWorkers } from './board';
import type { Ctx } from './context';
import { changeResources } from './economy';
import { randomInt } from './rng';
import type { DraftPick, GameState, PlayerId, Task, UpgradeChoice } from './types';

export function upkeepTier(character: CharacterId): UpkeepTier {
  const upkeep = CHARACTERS[character].upkeep;
  const tier = UPKEEP_TIERS.find((t) => t.upkeep === upkeep);
  if (!tier) throw new Error(`Нет строки отступных для содержания ${upkeep}`);
  return tier;
}

/** Порядок игроков по часовой стрелке, начиная с первого игрока. */
export function turnOrder(state: GameState): PlayerId[] {
  const n = state.players.length;
  return Array.from({ length: n }, (_, k) => (state.firstPlayer + k) % n);
}

/**
 * Сбросить пару «персонаж + профессия» за отступные: персонаж уходит в сброс,
 * профессия — в неограниченный запас (при драфте по числу игроков — обратно в пул профессий),
 * игрок получает отступные по содержанию персонажа.
 */
export function discardPair(
  c: Ctx,
  player: PlayerId,
  character: CharacterId,
  profession: ProfessionId,
  reason: 'draft' | 'replaced' | 'upkeep',
): void {
  c.draft.discard.push(character);
  returnProfession(c, profession);
  changeResources(c, player, upkeepTier(character).severance, 'severance');
  c.events.push({ type: 'pairDiscarded', player, character, profession, reason });
}

/** Вернуть профессию в пул (только при драфте по числу игроков; иначе запас неограничен). */
export function returnProfession(c: Ctx, profession: ProfessionId): void {
  if (c.draft.config.rules.draftSize === 'players') c.draft.professionPool.push(profession);
}

/** Вытянуть до n случайных профессий из пула (без возврата). */
function drawProfessions(c: Ctx, n: number): ProfessionId[] {
  const pool = c.draft.professionPool;
  const out: ProfessionId[] = [];
  while (out.length < n && pool.length > 0) {
    const [prof] = pool.splice(randomInt(c.draft, pool.length), 1);
    if (prof) out.push(prof);
  }
  return out;
}

/**
 * Подготовка драфта: выложить персонажей из колоды и по одной профессии каждого вида,
 * затем поставить в очередь круг 1 (с первого игрока), круг 2 (в обратном порядке)
 * и шаг улучшения (с первого игрока).
 */
export function dealDraft(c: Ctx): Task[] {
  const d = c.draft;
  const byPlayers = d.config.rules.draftSize === 'players';
  const size = d.players.length + DRAFT_BY_PLAYERS.extra;
  const need = byPlayers ? size : GAME.draftCharacters;
  const characters = d.deck.splice(0, Math.min(need, d.deck.length));
  // Эксперимент автора: случайные профессии из пула (повторы возможны, но ограничены пулом).
  const professions = byPlayers
    ? drawProfessions(c, size)
    : PROFESSION_ORDER.slice(0, GAME.draftProfessions);
  d.offer = { characters, professions: [...professions] };
  c.events.push({
    type: 'draftOffered',
    characters: [...characters],
    professions: [...professions],
  });

  const order = turnOrder(d);
  return [
    ...order.map((player): Task => ({ t: 'askDraft', player, circle: 1 })),
    ...[...order].reverse().map((player): Task => ({ t: 'askDraft', player, circle: 2 })),
    ...order.map((player): Task => ({ t: 'askUpgrade', player })),
  ];
}

export function draftOptions(state: GameState, player: PlayerId, circle: 1 | 2): DraftPick[] {
  const pick = state.players[player]?.draftPick;
  if (!pick) throw new Error(`Нет игрока ${player}`);
  const chars: DraftPick[] = state.offer.characters.map((character) => ({
    kind: 'character',
    character,
  }));
  const profs: DraftPick[] = state.offer.professions.map((profession) => ({
    kind: 'profession',
    profession,
  }));
  if (circle === 1) return [...chars, ...profs];
  // Круг 2: берётся недостающее.
  return pick.character === null ? chars : pick.profession === null ? profs : [];
}

export function applyDraftPick(c: Ctx, player: PlayerId, pick: DraftPick): void {
  const p = c.draft.players[player];
  if (!p) throw new Error(`Нет игрока ${player}`);
  const offer = c.draft.offer;
  if (pick.kind === 'character') {
    offer.characters.splice(offer.characters.indexOf(pick.character), 1);
    p.draftPick.character = pick.character;
  } else {
    offer.professions.splice(offer.professions.indexOf(pick.profession), 1);
    p.draftPick.profession = pick.profession;
  }
  c.events.push({ type: 'draftPicked', player, pick });
}

/**
 * Улучшение: пару назначают на своего рабочего без улучшения или заменяют ею имеющееся
 * улучшение (за старую пару — отступные), либо сразу сбрасывают пару за отступные.
 */
export function upgradeOptions(state: GameState, player: PlayerId): UpgradeChoice[] {
  const pick = state.players[player]?.draftPick;
  if (!pick || pick.character === null || pick.profession === null) return [];
  const own = state.workers.filter((w) => w.owner === player);
  return [
    ...distinctWorkers(own).map((w): UpgradeChoice => ({ kind: 'assign', workerId: w.id })),
    { kind: 'discard' },
  ];
}

export function applyUpgrade(c: Ctx, player: PlayerId, choice: UpgradeChoice): void {
  const p = c.draft.players[player];
  if (!p) throw new Error(`Нет игрока ${player}`);
  const { character, profession } = p.draftPick;
  if (character === null || profession === null) throw new Error('Пара не собрана');
  p.draftPick = { character: null, profession: null };

  if (choice.kind === 'discard') {
    discardPair(c, player, character, profession, 'draft');
    return;
  }
  const worker = c.draft.workers.find((w) => w.id === choice.workerId);
  if (!worker || worker.owner !== player) throw new Error(`Чужой рабочий ${choice.workerId}`);
  if (worker.character !== null && worker.profession !== null) {
    discardPair(c, player, worker.character, worker.profession, 'replaced');
  }
  worker.character = character;
  worker.profession = profession;
  c.events.push({ type: 'workerUpgraded', player, workerId: worker.id, character, profession });
}

/**
 * Конец раунда: невзятые на драфте персонажи (пул Таверны) уходят в сброс, профессии — в пул
 * профессий (при драфте по числу игроков).
 */
export function clearOffer(c: Ctx): void {
  c.draft.discard.push(...c.draft.offer.characters);
  for (const prof of c.draft.offer.professions) returnProfession(c, prof);
  c.draft.offer = { characters: [], professions: [] };
}
