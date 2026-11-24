/**
 * Эксперимент автора 23.11 «обратные треки, Шпиль и Обелиск» (influenceModel=reverse),
 * ответы автора пп. 27–33 (docs/author-answers-2026-11-23.md).
 */
import { BUILDINGS, REVERSE_TRACK, type LocationId, type RegionId } from '@vampire/data';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { buildOptions } from './buildings';
import { combatStrengths } from './combat';
import { changeInfluence } from './economy';
import { getLegalActions, getObservation } from './engine';
import { findInvariantViolations } from './invariants';
import { getScores } from './scores';
import type { Action, GameEvent, GameState, Position } from './types';
import { act, edit, moveWorker, newGame, res, setResources } from './testing';
import { upkeepCost } from './upkeep';

const at = (location: LocationId, slot: 1 | 2 = 1): Position => ({ kind: 'slot', location, slot });
const reverse = () => newGame({ rules: { influenceModel: 'reverse' } });

function influence(
  s: GameState,
  player: number,
  region: RegionId,
  amount: number,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const state = produce(s, (draft) => {
    changeInfluence({ draft, events }, player, region, amount, 'combat');
  });
  return { state, events };
}

const marks = (events: GameEvent[]) =>
  events.flatMap((e) => (e.type === 'undergroundMark' ? [e.at] : []));

/** Все пасуют до выбора в регионе `region` (жетон боя или награда). */
function toDecision(s: GameState, kind: 'combatToken' | 'combatReward', region: RegionId) {
  while (
    s.pending &&
    !(s.pending.kind === kind && 'region' in s.pending && s.pending.region === region)
  ) {
    const action: Action =
      s.pending.kind === 'placement' ? { type: 'pass' } : (getLegalActions(s)[0] as Action);
    s = act(s, action);
  }
  return s;
}

describe('Обратные треки: влияние и отметки (автор 23.11, пп. 27–28)', () => {
  it('По умолчанию эксперимент выключен: влияние не ниже 0, Обелиска нет', () => {
    const s = newGame();
    expect(s.config.rules.influenceModel).toBe('classic');
    expect(influence(s, 0, 'forest', -2).state.players[0]?.influence.forest).toBe(0);
    const rich = setResources(s, 0, { ore: 9, compromat: 9, gold: 20 });
    expect(buildOptions(rich, 0, { kind: 'chancery' }).some((c) => c.building === 'obelisk')).toBe(
      false,
    );
  });

  it('Влияние уходит до −4 и не ниже', () => {
    const { state } = influence(reverse(), 0, 'valley', -9);
    expect(state.players[0]?.influence.valley).toBe(REVERSE_TRACK.min);
    expect(findInvariantViolations(state)).toEqual([]);
  });

  it('Отметки −1 и −2 (автор 24.11): награда каждый раз, когда влияние опускается до них', () => {
    let s = reverse();
    const ore = res(s, 0).ore;
    const first = influence(s, 0, 'forest', -1);
    expect(marks(first.events)).toEqual([-1]);
    expect(res(first.state, 0).ore).toBe(ore + 1);
    // Вернулся к 0 и снова спустился — награда снова.
    s = influence(first.state, 0, 'forest', 1).state;
    const again = influence(s, 0, 'forest', -1);
    expect(marks(again.events)).toEqual([-1]);
    expect(res(again.state, 0).ore).toBe(ore + 2);
    // Спуск ниже уже пройденной отметки её не повторяет: −1 → −2 даёт только −2.
    expect(marks(influence(again.state, 0, 'forest', -1).events)).toEqual([-2]);
  });

  it('Отметка −3: постоянная сила — один раз за партию в регионе', () => {
    let s = influence(reverse(), 0, 'forest', -3).state;
    s = influence(s, 0, 'forest', 3).state;
    const again = influence(s, 0, 'forest', -3);
    expect(marks(again.events)).toEqual([-1, -2]);
    expect(again.state.players[0]?.undergroundStrength.forest).toBe(1);
  });

  it('Перескочил две отметки — получает обе; −2 даёт право стройки в этом регионе', () => {
    const s = setResources(reverse(), 0, { gold: 10 });
    const { state, events } = influence(s, 0, 'forest', -2);
    expect(marks(events)).toEqual([-1, -2]);
    expect(state.tasks[0]).toEqual({
      t: 'askBuild',
      player: 0,
      source: { kind: 'underground', region: 'forest' },
    });
    expect(
      buildOptions(state, 0, { kind: 'underground', region: 'forest' }).every(
        (c) => c.region === 'forest',
      ),
    ).toBe(true);
  });

  it('Отметка −3: постоянная сила +1 в боях региона, не снимается в конце раунда', () => {
    let s = moveWorker(reverse(), 'p0w0', at('mine'));
    const before = combatStrengths(s, 'forest').find((x) => x.player === 0)?.strength ?? 0;
    s = influence(s, 0, 'forest', -3).state;
    expect(s.players[0]?.undergroundStrength.forest).toBe(1);
    expect(combatStrengths(s, 'forest').find((x) => x.player === 0)?.strength).toBe(before + 1);
    // Чужой регион не усилен.
    expect(s.players[0]?.undergroundStrength.valley).toBe(0);
  });

  it('Отметка −4: право построить Обелиск сразу — только Обелиск', () => {
    const s = setResources(reverse(), 0, { gold: 20, ore: 3, compromat: 3 });
    const { state } = influence(s, 0, 'city', -4);
    expect(state.tasks.some((t) => t.t === 'askBuild' && t.source.kind === 'obelisk')).toBe(true);
    const options = buildOptions(state, 0, { kind: 'obelisk', region: 'city' });
    expect(options).toEqual([{ building: 'obelisk', region: 'city', plot: null }]);
  });
});

describe('Шпиль и Обелиск (автор 23.11, пп. 31–33)', () => {
  it('Обелиск (автор 24.11): 2 руды + 2 компромата, 5 престижа; влияние строящего — снова 0; звезда занята', () => {
    // Сценарий собран вручную (право стройки без хода размещения) — инварианты проверяем сами.
    const game = newGame({ rules: { influenceModel: 'reverse' }, checkInvariants: false });
    let s = setResources(game, 0, { ore: 2, compromat: 2 });
    s = influence(s, 0, 'forest', -4).state;
    s = edit(s, (d) => {
      d.tasks = [];
      d.pending = { kind: 'build', player: 0, source: { kind: 'obelisk', region: 'forest' } };
    });
    s = act(s, { type: 'build', choice: { building: 'obelisk', region: 'forest', plot: null } });
    expect(BUILDINGS.obelisk.cost).toEqual({ ore: 2, compromat: 2 });
    expect(res(s, 0)).toMatchObject({ ore: 1, compromat: 0 }); // +1 руда за отметку −1
    expect(s.players[0]?.prestige).toBe(5);
    expect(s.players[0]?.influence.forest).toBe(0);
    // Автор 24.11: при 3 игроках на звезде два места — Шпиль в Лесу ещё можно построить…
    s = edit(setResources(s, 1, { gold: 20, ore: 5 }), (d) => {
      d.players[1]!.influence.forest = 4;
      d.players[2]!.influence.forest = 4;
    });
    const spire = (st: typeof s, p: number) =>
      buildOptions(st, p, { kind: 'chancery' }).some(
        (c) => c.building === 'citadel' && c.region === 'forest',
      );
    expect(spire(s, 1)).toBe(true);
    // …а когда оба места заняты — уже нет.
    s = edit(setResources(s, 2, { gold: 20, ore: 5 }), (d) => {
      d.buildings.push({ type: 'citadel', owner: 1, region: 'forest', plot: null });
    });
    expect(spire(s, 2)).toBe(false);
    expect(findInvariantViolations(s).filter((e) => e !== 'нет ожидаемого решения')).toEqual([]);
  });

  it('Шпиль: победа в бою своего региона — можно взять 1 ПО вместо награды', () => {
    let s = edit(moveWorker(reverse(), 'p0w0', at('mine')), (d) => {
      d.buildings.push({ type: 'citadel', owner: 0, region: 'forest', plot: null });
      d.players[0]!.influence.forest = 4;
    });
    s = toDecision(s, 'combatReward', 'forest');
    expect(s.pending).toMatchObject({ kind: 'combatReward', player: 0 });
    // Базовое +1 влияние ещё не начислено: награда выбирается целиком.
    expect(s.players[0]?.influence.forest).toBe(4);
    expect(getLegalActions(s)).toContainEqual({ type: 'combatReward', choice: 'vp' });
    const vpBefore = getScores(s).find((x) => x.player === 0)?.vp ?? 0;
    s = act(s, { type: 'combatReward', choice: 'vp' });
    expect(s.players[0]?.influence.forest).toBe(4);
    expect(s.players[0]?.bonusVp).toBe(REVERSE_TRACK.spireVp);
    expect(getScores(s).find((x) => x.player === 0)?.vp).toBe(vpBefore + REVERSE_TRACK.spireVp);
  });

  it('Шпиль: обычная награда — как раньше, +1 и ещё +1 влияние', () => {
    let s = edit(moveWorker(reverse(), 'p0w0', at('mine')), (d) => {
      d.buildings.push({ type: 'citadel', owner: 0, region: 'forest', plot: null });
      d.players[0]!.influence.forest = 4;
    });
    s = act(toDecision(s, 'combatReward', 'forest'), { type: 'combatReward', choice: 'influence' });
    expect(s.players[0]?.influence.forest).toBe(6);
  });

  it('Без Шпиля выбора ПО нет; у Шпиля нет региональных эффектов (сила Леса, содержание Долины)', () => {
    let s = moveWorker(reverse(), 'p0w0', at('mine'));
    const plain = toDecision(s, 'combatReward', 'forest');
    expect(getLegalActions(plain)).not.toContainEqual({ type: 'combatReward', choice: 'vp' });
    const base = combatStrengths(s, 'forest')[0]?.strength;
    s = edit(s, (d) => {
      d.buildings.push(
        { type: 'citadel', owner: 0, region: 'forest', plot: null },
        { type: 'citadel', owner: 0, region: 'valley', plot: null },
      );
    });
    expect(combatStrengths(s, 'forest')[0]?.strength).toBe(base);
    s = edit(s, (d) => {
      d.workers.find((w) => w.id === 'p0w0')!.character = 'officer';
      d.workers.find((w) => w.id === 'p0w0')!.profession = 'guard';
    });
    const w = s.workers.find((x) => x.id === 'p0w0')!;
    expect(upkeepCost(s, w)).toBe(2); // Офицер: содержание 2, скидки Долины нет
  });

  it('Обелиск: владелец получает компромат, когда бой в регионе выигрывает соперник', () => {
    let s = edit(moveWorker(reverse(), 'p1w0', at('mine')), (d) => {
      d.buildings.push({ type: 'obelisk', owner: 0, region: 'forest', plot: null });
    });
    const comp = res(s, 0).compromat;
    s = toDecision(s, 'combatReward', 'forest');
    expect(s.pending).toMatchObject({ player: 1 });
    expect(res(s, 0).compromat).toBe(comp + REVERSE_TRACK.obeliskCompromatPerRivalWin);
  });
});

describe('Спуск жетонами боя (автор 23.11, п. 29)', () => {
  it('Приманка (автор 24.11): на выбор потеря 0 или 1 влияния; соперник её не видит до вскрытия', () => {
    let s = moveWorker(reverse(), 'p0w0', at('mine'));
    s = moveWorker(s, 'p1w0', at('witchCircle'));
    s = toDecision(s, 'combatToken', 'forest');
    const me = s.pending?.player ?? 0;
    const rival = me === 0 ? 1 : 0;
    const decoys = getLegalActions(s).filter(
      (a) => a.type === 'combatToken' && a.token === 'decoy',
    );
    expect(decoys.map((a) => (a.type === 'combatToken' ? a.influenceLoss : null))).toEqual([0, 1]);
    s = act(s, { type: 'combatToken', token: 'decoy', influenceLoss: 1 });
    const seen = getObservation(s, rival).combat?.plays.find((p) => p.player === me);
    expect(seen).toEqual({ player: me, token: null });
    s = toDecision(s, 'combatReward', 'forest');
    expect(s.players[me]?.influence.forest).toBe(-1);
  });

  it('Отступление (автор 24.11): на выбор потеря до 2 влияния', () => {
    let s = moveWorker(reverse(), 'p0w0', at('mine'));
    s = moveWorker(s, 'p1w0', at('witchCircle'));
    s = toDecision(s, 'combatToken', 'forest');
    const me = s.pending?.player ?? 0;
    s = act(s, { type: 'combatToken', token: 'retreat', influenceLoss: 2 });
    while (s.pending && s.pending.kind !== 'combatReward') {
      s = act(s, getLegalActions(s)[0] as Action);
    }
    expect(s.players[me]?.influence.forest).toBe(-2);
  });

  it('Обычная игра: Приманка без выбора потери, Отступление влияние не снимает', () => {
    let s = moveWorker(newGame(), 'p0w0', at('mine'));
    s = moveWorker(s, 'p1w0', at('witchCircle'));
    s = toDecision(s, 'combatToken', 'forest');
    const decoys = getLegalActions(s).filter(
      (a) => a.type === 'combatToken' && a.token === 'decoy',
    );
    expect(decoys).toEqual([{ type: 'combatToken', token: 'decoy' }]);
  });
});
