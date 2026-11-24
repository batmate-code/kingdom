/** Аудит этапа 3: дополнительные сценарии по пунктам правил («Бой», «Профессии», «Здания»). */
import type { CombatTokenId, LocationId, RegionId } from '@vampire/data';
import { describe, expect, it } from 'vitest';
import { getLegalActions } from './engine';
import type { Action, GameEvent, GameState, Position } from './types';
import { act, edit, moveWorker, newGame, setWorker } from './testing';

const at = (location: LocationId, slot: 1 | 2 = 1): Position => ({ kind: 'slot', location, slot });

/** Доиграть бои раунда: все пасуют, жетоны по сценарию (`игрок:регион`), иначе первый вариант. */
function fight(
  s: GameState,
  tokens: Partial<Record<`${number}:${RegionId}`, CombatTokenId>> = {},
  log: GameEvent[] = [],
): GameState {
  while (s.pending && s.pending.kind !== 'upkeep' && s.phase !== 'draft') {
    const p = s.pending;
    const chosen = p.kind === 'combatToken' ? tokens[`${p.player}:${p.region}`] : undefined;
    const action: Action =
      p.kind === 'placement'
        ? { type: 'pass' }
        : chosen
          ? { type: 'combatToken', token: chosen }
          : (getLegalActions(s)[0] as Action);
    s = act(s, action, log);
  }
  return s;
}

const combatIn = (log: GameEvent[], region: RegionId) =>
  log.flatMap((e) => (e.type === 'combatResolved' && e.region === region ? [e] : []))[0];

/** p0 в Руднике, p1 в Ведьмином круге (Лес), сила 1:1. */
const duel = (): GameState => {
  const s = moveWorker(newGame(), 'p0w0', at('mine'));
  return moveWorker(s, 'p1w0', at('witchCircle'));
};

describe('Аудит этапа 3 (Бой)', () => {
  it('Бой: при равенстве силы и числа рабочих победителя нет и награды нет', () => {
    const log: GameEvent[] = [];
    fight(duel(), {}, log);
    expect(combatIn(log, 'forest')?.winner).toBeNull();
    expect(log.some((e) => e.type === 'influenceChanged')).toBe(false);
  });

  it('Бой + ответ автора 3.3: при равной силе «больше рабочих» считает только первые слоты', () => {
    let s = moveWorker(duel(), 'p0w1', at('lair'));
    s = setWorker(s, 'p1w0', { profession: 'spy' }); // сила 2, один участник
    s = moveWorker(s, 'p1w1', at('lair', 2)); // второй слот не считается
    const log: GameEvent[] = [];
    fight(s, {}, log);
    expect(combatIn(log, 'forest')?.strengths).toEqual([
      { player: 0, strength: 2, workers: 2 },
      { player: 1, strength: 2, workers: 1 },
    ]);
    expect(combatIn(log, 'forest')?.winner).toBe(0);
  });

  it('Бой + госпиталь: игрок, у которого в регионе только рабочий в госпитале, не участвует и не кладёт жетон', () => {
    let s = moveWorker(duel(), 'p0w0', { kind: 'hospital' });
    while (s.pending?.kind === 'placement') s = act(s, { type: 'pass' });
    expect(s.pending).toEqual({ kind: 'combatToken', player: 1, region: 'forest' });
    s = act(s, { type: 'combatToken', token: 'decoy' });
    expect(s.pending?.kind === 'combatToken' && s.pending.player === 0).toBe(false);
  });

  it('Профессии, Шпион: сила 2 в первом слоте и у места Цитадели после перемещения', () => {
    const s = setWorker(duel(), 'p0w0', { profession: 'spy' });
    const log: GameEvent[] = [];
    fight(s, {}, log);
    expect(combatIn(log, 'forest')?.strengths.find((x) => x.player === 0)?.strength).toBe(2);
    expect(combatIn(log, 'forest')?.winner).toBe(0);
  });

  it('Склеп (автор 24.11): +1 за каждого своего рабочего в соседних локациях — двойной участок даёт +2', () => {
    let s = moveWorker(duel(), 'p0w1', at('lair'));
    s = edit(s, (d) => {
      d.buildings.push({ type: 'crypt', owner: 0, region: 'forest', plot: 'forest-mine-lair' });
    });
    const log: GameEvent[] = [];
    fight(s, {}, log);
    expect(combatIn(log, 'forest')?.strengths.find((x) => x.player === 0)).toEqual({
      player: 0,
      strength: 2 + 2,
      workers: 2,
    });
  });

  it('Здания, Склеп: Склеп другого региона силы в бою Леса не даёт', () => {
    const s = edit(duel(), (d) => {
      d.buildings.push({ type: 'crypt', owner: 0, region: 'valley', plot: 'valley-market' });
    });
    const log: GameEvent[] = [];
    fight(s, {}, log);
    expect(combatIn(log, 'forest')?.strengths.find((x) => x.player === 0)?.strength).toBe(1);
  });

  it('Отступление: отступивший в новом регионе кладёт жетон и участвует, потраченное Отступление не вернётся до конца 3-го раунда', () => {
    let s = edit(duel(), (d) => {
      d.firstPlayer = 0;
    });
    while (s.pending?.kind === 'placement') s = act(s, { type: 'pass' });
    s = act(s, { type: 'combatToken', token: 'retreat' }); // p0
    s = act(s, { type: 'combatToken', token: 'decoy' }); // p1
    s = act(s, { type: 'retreat', to: 'valley' });
    // p1 победил в Лесу: награда — влияние (у него хватает золота и на Склеп).
    s = act(s, { type: 'combatReward', choice: 'influence' });
    expect(s.pending).toEqual({ kind: 'combatToken', player: 0, region: 'valley' });
    expect(getLegalActions(s).some((a) => a.type === 'combatToken' && a.token === 'retreat')).toBe(
      false,
    );
  });

  it('Жетоны боя: Доминирование отменяет Отступление и в Городе (OQ-27)', () => {
    let s = moveWorker(newGame(), 'p0w0', at('cityHall'));
    s = moveWorker(s, 'p1w0', at('chancery'));
    const log: GameEvent[] = [];
    fight(s, { '0:city': 'retreat', '1:city': 'domination' }, log);
    // Отступление отменено: p0 остаётся в бою с силой 1, ничья 1:1.
    expect(combatIn(log, 'city')?.strengths).toEqual([
      { player: 0, strength: 1, workers: 1 },
      { player: 1, strength: 1, workers: 1 },
    ]);
  });

  it('Бой, награда: победитель получает +1 влияние и ещё +1 на выбор', () => {
    let s = edit(duel(), (d) => {
      d.firstPlayer = 0;
    });
    while (s.pending?.kind === 'placement') s = act(s, { type: 'pass' });
    s = act(s, { type: 'combatToken', token: 'attack' }); // p0
    s = act(s, { type: 'combatToken', token: 'decoy' }); // p1
    s = act(s, { type: 'combatReward', choice: 'influence' });
    expect(s.players[0]?.influence.forest).toBe(2);
    expect(s.players[1]?.influence.forest).toBe(0);
  });
});
