/** Этап 3: полный бой — жетоны боя, Шпион, Отступление, Комиссариат, Склепы (rules.md, «Бой»). */
import {
  COMMISSARIAT_STRENGTH_PER_WORKER,
  type CombatTokenId,
  type LocationId,
  type RegionId,
} from '@vampire/data';
import { describe, expect, it } from 'vitest';
import { getLegalActions, getObservation } from './engine';
import type { RuleToggles } from './config';
import type { Action, GameEvent, GameState, Position } from './types';
import {
  act,
  choose,
  edit,
  moveWorker,
  newGame,
  place,
  setResources,
  setWorker,
  turnTo,
} from './testing';

const at = (location: LocationId, slot: 1 | 2 = 1): Position => ({ kind: 'slot', location, slot });

type Key = `${number}:${RegionId}`;

interface Script {
  tokens?: Partial<Record<Key, CombatTokenId>>;
  retreat?: Partial<Record<Key, RegionId>>;
  spy?: Partial<Record<string, RegionId>>;
}

/**
 * Доиграть бои текущего раунда: все пасуют, жетоны и решения — по сценарию, иначе первый
 * вариант (Приманка, Шпион остаётся). Останавливается перед содержанием.
 */
function fight(s: GameState, script: Script = {}, log: GameEvent[] = []): GameState {
  while (s.pending && s.pending.kind !== 'upkeep' && s.phase !== 'draft') {
    const p = s.pending;
    let action: Action;
    if (p.kind === 'placement') action = { type: 'pass' };
    else if (p.kind === 'combatToken' && script.tokens?.[`${p.player}:${p.region}`]) {
      action = {
        type: 'combatToken',
        token: script.tokens[`${p.player}:${p.region}`] as CombatTokenId,
      };
    } else if (p.kind === 'retreat' && script.retreat?.[`${p.player}:${p.region}`]) {
      action = { type: 'retreat', to: script.retreat[`${p.player}:${p.region}`] as RegionId };
    } else if (p.kind === 'spyMove' && script.spy?.[p.workerId]) {
      // Первый свободный первый слот в нужном регионе (автор 23.11).
      const region = script.spy[p.workerId] as RegionId;
      action = getLegalActions(s).find(
        (a) => a.type === 'spyMove' && a.region === region,
      ) as Action;
    } else action = getLegalActions(s)[0] as Action;
    s = act(s, action, log);
  }
  return s;
}

/** Куда перемещали рабочего (Шпион, Отступление) — по журналу. */
const movedTo = (log: GameEvent[], workerId: string) =>
  log.flatMap((e) => (e.type === 'workerMoved' && e.workerId === workerId ? [e.to] : []));

const combats = (log: GameEvent[]) => log.flatMap((e) => (e.type === 'combatResolved' ? [e] : []));
const combatIn = (log: GameEvent[], region: RegionId) =>
  combats(log).find((c) => c.region === region);

/** p0 в Руднике, p1 в Ведьмином круге (Лес), сила 1:1. */
function duel(rules: Partial<RuleToggles> = {}): GameState {
  let s = newGame({ rules });
  s = moveWorker(s, 'p0w0', at('mine'));
  return moveWorker(s, 'p1w0', at('witchCircle'));
}

describe('Жетоны боя (Бой, порядок для каждого региона)', () => {
  it('Участники с жетонами кладут по одному, по очереди с первого игрока', () => {
    let s = edit(duel(), (d) => {
      d.firstPlayer = 1;
    });
    while (s.pending?.kind === 'placement') s = act(s, { type: 'pass' });
    expect(s.pending).toEqual({ kind: 'combatToken', player: 1, region: 'forest' });
    s = act(s, { type: 'combatToken', token: 'attack' });
    expect(s.pending).toEqual({ kind: 'combatToken', player: 0, region: 'forest' });
  });

  it('До вскрытия соперник не видит жетон, рука не меняется; после — уходит в сброс', () => {
    let s = edit(duel(), (d) => {
      d.firstPlayer = 0;
    });
    while (s.pending?.kind === 'placement') s = act(s, { type: 'pass' });
    s = act(s, { type: 'combatToken', token: 'massacre' });
    expect(getObservation(s, 1).combat?.plays).toEqual([{ player: 0, token: null }]);
    expect(getObservation(s, 0).combat?.plays).toEqual([{ player: 0, token: 'massacre' }]);
    expect(s.players[0]?.combatTokens.hand.massacre).toBe(1);
    const log: GameEvent[] = [];
    s = act(s, { type: 'combatToken', token: 'decoy' }, log);
    expect(log).toContainEqual({
      type: 'combatTokensRevealed',
      region: 'forest',
      plays: [
        { player: 0, token: 'massacre' },
        { player: 1, token: 'decoy' },
      ],
    });
    expect(s.players[0]?.combatTokens.hand.massacre).toBe(0);
    expect(s.players[0]?.combatTokens.discard.massacre).toBe(1);
  });

  it('Атака +1, Резня +2', () => {
    const log: GameEvent[] = [];
    fight(duel(), { tokens: { '0:forest': 'attack', '1:forest': 'massacre' } }, log);
    expect(combatIn(log, 'forest')?.strengths).toEqual([
      { player: 0, strength: 2, workers: 1 },
      { player: 1, strength: 3, workers: 1 },
    ]);
    expect(combatIn(log, 'forest')?.winner).toBe(1);
  });

  it('Защита +1 и отменяет Резню соперника', () => {
    const log: GameEvent[] = [];
    fight(duel(), { tokens: { '0:forest': 'defense', '1:forest': 'massacre' } }, log);
    expect(combatIn(log, 'forest')?.strengths).toEqual([
      { player: 0, strength: 2, workers: 1 },
      { player: 1, strength: 1, workers: 1 },
    ]);
  });

  it('OQ-22: Защита отменяет Резню каждого соперника', () => {
    const s = moveWorker(duel(), 'p2w0', at('lair'));
    const log: GameEvent[] = [];
    fight(
      s,
      { tokens: { '0:forest': 'defense', '1:forest': 'massacre', '2:forest': 'massacre' } },
      log,
    );
    expect(combatIn(log, 'forest')?.strengths.map((x) => x.strength)).toEqual([2, 1, 1]);
  });

  it('Доминирование: при победе +1 влияние сверх обычной награды', () => {
    let s = setWorker(duel(), 'p0w0', { profession: 'spy' });
    s = fight(s, { tokens: { '0:forest': 'domination' } });
    // 1 (победа) + 1 (Доминирование) + 1 (награда на выбор).
    expect(s.players[0]?.influence.forest).toBe(3);
  });

  it('Доминирование без победы ничего не даёт', () => {
    const s = fight(duel(), { tokens: { '0:forest': 'domination', '1:forest': 'attack' } });
    expect(s.players[0]?.influence.forest).toBe(0);
  });

  it('Приманка без эффекта', () => {
    const log: GameEvent[] = [];
    fight(duel(), { tokens: { '0:forest': 'decoy', '1:forest': 'decoy' } }, log);
    expect(combatIn(log, 'forest')?.winner).toBeNull();
  });

  it('Без жетонов в руке игрок сражается без жетона', () => {
    let s = edit(duel(), (d) => {
      for (const t of Object.keys(d.players[0]!.combatTokens.hand) as CombatTokenId[]) {
        d.players[0]!.combatTokens.discard[t] += d.players[0]!.combatTokens.hand[t];
        d.players[0]!.combatTokens.hand[t] = 0;
      }
    });
    while (s.pending?.kind === 'placement') s = act(s, { type: 'pass' });
    expect(s.pending).toMatchObject({ kind: 'combatToken', player: 1 });
    const log: GameEvent[] = [];
    s = act(s, { type: 'combatToken', token: 'attack' }, log);
    expect(combatIn(log, 'forest')?.strengths).toEqual([
      { player: 0, strength: 1, workers: 1 },
      { player: 1, strength: 2, workers: 1 },
    ]);
  });

  it('Жетоны кладут участники боя: автор 23.11 — рабочий во втором слоте тоже даёт право', () => {
    let s = moveWorker(duel(), 'p2w0', at('lair', 2));
    const asked: number[] = [];
    while (s.pending && s.pending.kind !== 'upkeep') {
      if (s.pending.kind === 'combatToken' && s.pending.region === 'forest') {
        asked.push(s.pending.player);
      }
      s = act(
        s,
        s.pending.kind === 'placement' ? { type: 'pass' } : (getLegalActions(s)[0] as Action),
      );
    }
    expect(asked.sort()).toEqual([0, 1, 2]);
  });

  it('OQ-23: единственный участник тоже кладёт жетон; с переключателем — нет', () => {
    for (const rule of [true, false]) {
      let s = moveWorker(
        newGame({ rules: { combatTokensWithoutOpponents: rule } }),
        'p0w0',
        at('mine'),
      );
      while (s.pending?.kind === 'placement') s = act(s, { type: 'pass' });
      // Приманки не единственный вариант — решение не принимается автоматически.
      expect(s.pending?.kind === 'combatToken').toBe(rule);
    }
  });

  it('Сыгранные жетоны возвращаются в руку в конце 3-го раунда, не раньше (combatTokenSet=base)', () => {
    let s = fight(duel({ combatTokenSet: 'base' }), { tokens: { '0:forest': 'massacre' } });
    const log: GameEvent[] = [];
    const massacre = () => {
      const t = s.players[0]?.combatTokens;
      return [t?.hand.massacre, t?.discard.massacre];
    };
    // Дальше все пасуют: боёв с участниками нет.
    while (s.round < 3 || (s.round === 3 && s.pending)) {
      if (s.round <= 3) expect(massacre()).toEqual([0, 1]);
      s = act(
        s,
        s.pending?.kind === 'placement' ? { type: 'pass' } : (getLegalActions(s)[0] as Action),
        log,
      );
      if (s.round === 4) break;
    }
    expect(log.filter((e) => e.type === 'combatTokensRefreshed')).toHaveLength(1);
    expect(massacre()).toEqual([1, 0]);
  });
});

describe('Отступление (Бой, жетон Отступление)', () => {
  it('Игрок проигрывает и переносит всех рабочих региона, включая вторые слоты, к месту Цитадели', () => {
    let s = moveWorker(duel(), 'p0w1', at('lair', 2));
    s = edit(s, (d) => {
      d.powerTokens.push({ owner: 0, region: 'forest', count: 3 });
    });
    const log: GameEvent[] = [];
    fight(s, { tokens: { '0:forest': 'retreat' }, retreat: { '0:forest': 'valley' } }, log);
    expect(combatIn(log, 'forest')?.strengths.map((x) => x.player)).toEqual([1]);
    expect(combatIn(log, 'forest')?.winner).toBe(1);
    expect(movedTo(log, 'p0w0')).toEqual(['valley']);
    expect(movedTo(log, 'p0w1')).toEqual(['valley']);
    // В Долине оба участвуют; жетоны силы остались в Лесу.
    expect(combatIn(log, 'valley')?.strengths).toEqual([{ player: 0, strength: 2, workers: 2 }]);
  });

  it('Регион выбирает отступающий — только где боя ещё не было', () => {
    let s = duel();
    while (s.pending?.kind === 'placement') s = act(s, { type: 'pass' });
    while (s.pending?.kind === 'combatToken') {
      s = act(s, { type: 'combatToken', token: s.pending.player === 0 ? 'retreat' : 'decoy' });
    }
    expect(s.pending).toEqual({ kind: 'retreat', player: 0, region: 'forest' });
    expect(getLegalActions(s)).toEqual([
      { type: 'retreat', to: 'valley' },
      { type: 'retreat', to: 'city' },
    ]);
  });

  it('Из Долины — только в Город (выбор автоматический)', () => {
    let s = newGame();
    s = moveWorker(s, 'p0w0', at('mass'));
    s = moveWorker(s, 'p1w0', at('market'));
    const log: GameEvent[] = [];
    fight(s, { tokens: { '0:valley': 'retreat' } }, log);
    expect(movedTo(log, 'p0w0')).toEqual(['city']);
    expect(combatIn(log, 'city')?.strengths).toEqual([{ player: 0, strength: 1, workers: 1 }]);
  });

  it('В Городе — просто проигрыш, рабочие остаются', () => {
    let s = newGame();
    s = moveWorker(s, 'p0w0', at('chancery'));
    s = moveWorker(s, 'p1w0', at('cityHall'));
    s = setWorker(s, 'p0w0', { profession: 'spy' });
    const log: GameEvent[] = [];
    fight(s, { tokens: { '0:city': 'retreat' } }, log);
    expect(combatIn(log, 'city')?.winner).toBe(1);
    expect(movedTo(log, 'p0w0')).toEqual([]);
  });

  it('Доминирование соперника отменяет Отступление: игрок остаётся в бою со своей силой', () => {
    const s = setWorker(duel(), 'p0w0', { profession: 'spy' });
    const log: GameEvent[] = [];
    fight(s, { tokens: { '0:forest': 'retreat', '1:forest': 'domination' } }, log);
    expect(combatIn(log, 'forest')?.winner).toBe(0);
    expect(movedTo(log, 'p0w0')).toEqual([]);
  });
});

describe('Крайние случаи боя', () => {
  it('Бой без участников: победителя нет, решений не требуется', () => {
    const log: GameEvent[] = [];
    fight(newGame(), {}, log);
    expect(combatIn(log, 'forest')).toEqual({
      type: 'combatResolved',
      region: 'forest',
      strengths: [],
      winner: null,
    });
  });

  it('Отступившие участвуют в бою нового региона, но второго Отступления в наборе нет', () => {
    let s = moveWorker(duel(), 'p2w0', at('mass'));
    while (s.pending?.kind === 'placement') s = act(s, { type: 'pass' });
    while (s.pending?.kind === 'combatToken' && s.pending.region === 'forest') {
      s = act(s, { type: 'combatToken', token: s.pending.player === 0 ? 'retreat' : 'decoy' });
    }
    s = act(s, { type: 'retreat', to: 'valley' });
    while (s.pending?.kind !== 'combatToken' || s.pending.region !== 'valley') {
      s = act(s, getLegalActions(s)[0] as Action);
    }
    while (s.pending?.player !== 0) s = act(s, getLegalActions(s)[0] as Action);
    expect(s.pending).toEqual({ kind: 'combatToken', player: 0, region: 'valley' });
    expect(getLegalActions(s)).not.toContainEqual({ type: 'combatToken', token: 'retreat' });
  });

  it('OQ-24: владелец жетона Комиссариата без рабочих не выбирает регион Отступления', () => {
    let s = duel({ commissariatWithoutWorkers: true });
    s = edit(s, (d) => {
      d.commissariat = { owner: 2, region: 'forest' };
    });
    while (s.pending?.kind === 'placement') s = act(s, { type: 'pass' });
    while (s.pending?.kind === 'combatToken') {
      s = act(s, { type: 'combatToken', token: s.pending.player === 2 ? 'retreat' : 'decoy' });
    }
    expect(s.pending?.kind).not.toBe('retreat');
  });
});

describe('Шпион перед боями (Бой, «Перед боями»)', () => {
  it('Автор 23.11: переходит бесплатно в выбранный свободный слот другого региона и освобождает свой', () => {
    let s = setWorker(duel(), 'p0w0', { profession: 'spy' });
    s = setResources(s, 0, { gold: 0 });
    const log: GameEvent[] = [];
    fight(s, { spy: { p0w0: 'city' } }, log);
    expect(movedTo(log, 'p0w0')).toEqual(['city']);
    expect(log.some((e) => e.type === 'cityEntryPaid')).toBe(false);
    expect(combatIn(log, 'forest')?.strengths.map((x) => x.player)).toEqual([1]);
    expect(combatIn(log, 'city')?.strengths).toEqual([{ player: 0, strength: 2, workers: 1 }]);
  });

  it('Автор 23.11: варианты — остаться или любой свободный слот (локация и слот) другого региона', () => {
    let s = setWorker(duel(), 'p0w0', { profession: 'spy' });
    while (s.pending?.kind === 'placement') s = act(s, { type: 'pass' });
    expect(s.pending).toEqual({ kind: 'spyMove', player: 0, workerId: 'p0w0' });
    const moves = getLegalActions(s).flatMap((a) => (a.type === 'spyMove' ? [a] : []));
    expect(moves[0]).toEqual({ type: 'spyMove', region: null });
    // Только другие регионы; выбираются локация и слот (оба слота свободны).
    expect(moves.slice(1).every((a) => a.location && a.slot)).toBe(true);
    expect(moves).toContainEqual({
      type: 'spyMove',
      region: 'valley',
      location: 'market',
      slot: 2,
    });
    // Автор 24.11: и в другой слот своего региона.
    expect(new Set(moves.slice(1).map((a) => a.region))).toEqual(
      new Set(['forest', 'valley', 'city']),
    );
  });

  it('Шпионы решают по очереди с первого игрока; Шпион из второго слота тоже может уйти', () => {
    let s = edit(duel(), (d) => {
      d.firstPlayer = 1;
    });
    s = setWorker(s, 'p0w0', { profession: 'spy' });
    s = setWorker(s, 'p1w1', { profession: 'spy' });
    s = moveWorker(s, 'p1w1', at('lair', 2));
    while (s.pending?.kind === 'placement') s = act(s, { type: 'pass' });
    expect(s.pending).toEqual({ kind: 'spyMove', player: 1, workerId: 'p1w1' });
    s = act(s, { type: 'spyMove', region: 'valley', location: 'market', slot: 1 });
    expect(s.pending).toEqual({ kind: 'spyMove', player: 0, workerId: 'p0w0' });
  });

  it('Автор 23.11: занятые слоты недоступны; все слоты региона заняты — перейти туда нельзя', () => {
    let s = setWorker(duel(), 'p0w0', { profession: 'spy' });
    s = moveWorker(s, 'p0w1', at('market'));
    s = moveWorker(s, 'p0w2', at('market', 2));
    s = moveWorker(s, 'p1w1', at('mass'));
    s = moveWorker(s, 'p1w2', at('mass', 2));
    s = moveWorker(s, 'p2w0', at('tavern'));
    s = moveWorker(s, 'p2w1', at('tavern', 2));
    while (s.pending?.kind === 'placement') s = act(s, { type: 'pass' });
    const regions = getLegalActions(s).flatMap((a) => (a.type === 'spyMove' ? [a.region] : []));
    expect(regions).not.toContain('valley');
    expect(regions).toContain('city');
  });

  it('OQ-26: два Шпиона одного игрока решают подряд', () => {
    let s = setWorker(duel(), 'p0w0', { profession: 'spy' });
    s = setWorker(s, 'p0w1', { profession: 'spy' });
    s = setWorker(s, 'p1w0', { profession: 'spy' });
    s = moveWorker(s, 'p0w1', at('mass'));
    s = edit(s, (d) => {
      d.firstPlayer = 0;
    });
    const asked: string[] = [];
    while (s.pending?.kind === 'placement') s = act(s, { type: 'pass' });
    while (s.pending?.kind === 'spyMove') {
      asked.push(s.pending.workerId);
      s = act(s, { type: 'spyMove', region: null });
    }
    expect(asked).toEqual(['p0w0', 'p0w1', 'p1w0']);
  });

  it('Шпион в госпитале не перемещается', () => {
    let s = setWorker(duel(), 'p0w1', { profession: 'spy' });
    s = moveWorker(s, 'p0w1', { kind: 'hospital' });
    while (s.pending?.kind === 'placement') s = act(s, { type: 'pass' });
    expect(s.pending?.kind).not.toBe('spyMove');
  });
});

describe('Комиссариат (Локации, Комиссариат)', () => {
  it('Первый слот: взять жетон и выбрать регион', () => {
    let s = turnTo(newGame(), 0);
    s = setResources(s, 0, { gold: 5 });
    s = place(s, 'commissariat', 1);
    expect(getLegalActions(s)).toEqual([
      { type: 'locationAction', choice: { kind: 'commissariat', region: 'forest' } },
      { type: 'locationAction', choice: { kind: 'commissariat', region: 'valley' } },
      { type: 'locationAction', choice: { kind: 'commissariat', region: 'city' } },
    ]);
    s = choose(s, { kind: 'commissariat', region: 'forest' });
    expect(s.commissariat).toEqual({ owner: 0, region: 'forest' });
  });

  it('Автор 23.11: в бою выбранного региона владелец получает 2 силы за каждого рабочего в госпитале', () => {
    let s = duel();
    s = moveWorker(s, 'p1w1', { kind: 'hospital' });
    s = setWorker(s, 'p2w0', { profession: 'spy' });
    s = moveWorker(s, 'p2w0', { kind: 'hospital' });
    s = edit(s, (d) => {
      d.commissariat = { owner: 0, region: 'forest' };
    });
    const log: GameEvent[] = [];
    fight(s, {}, log);
    expect(combatIn(log, 'forest')?.strengths).toEqual([
      // Два рабочих в госпитале (профессия не важна) × COMMISSARIAT_STRENGTH_PER_WORKER.
      { player: 0, strength: 1 + 2 * COMMISSARIAT_STRENGTH_PER_WORKER, workers: 1 },
      { player: 1, strength: 1, workers: 1 },
    ]);
  });

  it('Копия первого слота через Подполье забирает жетон', () => {
    let s = edit(newGame(), (d) => {
      d.commissariat = { owner: 1, region: 'city' };
    });
    s = turnTo(s, 0);
    s = setResources(s, 0, { gold: 5 });
    s = place(s, 'underground', 1);
    s = choose(s, { kind: 'copy', location: 'commissariat', slot: 1 });
    s = choose(s, { kind: 'commissariat', region: 'valley' });
    expect(s.commissariat).toEqual({ owner: 0, region: 'valley' });
  });

  it('Жетон снимается в конце раунда', () => {
    let s = edit(duel(), (d) => {
      d.commissariat = { owner: 0, region: 'forest' };
    });
    s = fight(s);
    while (s.round === 1 && s.pending) s = act(s, getLegalActions(s)[0] as Action);
    expect(s.commissariat).toBeNull();
  });

  it('Автор 23.11 (вместо OQ-24): жетон — присутствие в регионе; с переключателем «нет» — не участвует', () => {
    for (const rule of [false, true]) {
      let s = duel({ commissariatWithoutWorkers: rule });
      s = moveWorker(s, 'p0w1', { kind: 'hospital' });
      s = edit(s, (d) => {
        d.commissariat = { owner: 2, region: 'forest' };
      });
      const log: GameEvent[] = [];
      fight(s, {}, log);
      const p2 = combatIn(log, 'forest')?.strengths.find((x) => x.player === 2);
      expect(p2).toEqual(
        rule ? { player: 2, strength: COMMISSARIAT_STRENGTH_PER_WORKER, workers: 0 } : undefined,
      );
    }
  });
});

describe('Склепы и Цитадель Леса (Бой, сила игрока)', () => {
  const withCrypt = (s: GameState, plot: string, owner = 0) =>
    edit(s, (d) => {
      d.buildings.push({ type: 'crypt', owner, region: 'forest', plot });
    });

  it('+1 за каждый свой Склеп рядом с локацией, где стоит твой рабочий', () => {
    let s = withCrypt(duel(), 'forest-mine');
    s = withCrypt(s, 'forest-mine-lair');
    s = withCrypt(s, 'forest-lair'); // рядом нет рабочего p0
    s = withCrypt(s, 'forest-witchCircle', 1);
    const log: GameEvent[] = [];
    fight(s, {}, log);
    expect(combatIn(log, 'forest')?.strengths).toEqual([
      { player: 0, strength: 1 + 2, workers: 1 },
      { player: 1, strength: 1 + 1, workers: 1 },
    ]);
  });

  it('Чужой Склеп рядом с твоим рабочим силы не даёт', () => {
    const s = withCrypt(duel(), 'forest-mine', 1);
    const log: GameEvent[] = [];
    fight(s, {}, log);
    expect(combatIn(log, 'forest')?.strengths.find((x) => x.player === 1)?.strength).toBe(1);
  });

  it('Рабочий у места Цитадели не стоит в локации — Склеп не срабатывает', () => {
    let s = moveWorker(duel(), 'p0w0', { kind: 'citadelSpot', region: 'forest' });
    s = withCrypt(s, 'forest-mine');
    const log: GameEvent[] = [];
    fight(s, {}, log);
    expect(combatIn(log, 'forest')?.strengths.find((x) => x.player === 0)?.strength).toBe(1);
  });

  it('OQ-25: рабочий во втором слоте соседней локации включает Склеп; с переключателем — нет', () => {
    for (const rule of [true, false]) {
      let s = moveWorker(duel({ cryptCountsSecondSlot: rule }), 'p0w1', at('lair', 2));
      s = withCrypt(s, 'forest-lair');
      const log: GameEvent[] = [];
      fight(s, {}, log);
      const p0 = combatIn(log, 'forest')?.strengths.find((x) => x.player === 0);
      expect(p0?.strength).toBe(rule ? 2 : 1);
    }
  });

  it('Цитадель Леса: +2 силы владельцу в боях Леса', () => {
    const s = edit(duel(), (d) => {
      d.buildings.push({ type: 'citadel', owner: 1, region: 'forest', plot: null });
    });
    const log: GameEvent[] = [];
    fight(s, {}, log);
    expect(combatIn(log, 'forest')?.strengths.find((x) => x.player === 1)?.strength).toBe(3);
  });
});
