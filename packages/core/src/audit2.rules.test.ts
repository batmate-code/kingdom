/** Тесты-сценарии аудита этапа 2: пробелы драфта, улучшения, содержания, Палача и Таверны. */
import { PROFESSION_ORDER, type CharacterId } from '@vampire/data';
import { describe, expect, it } from 'vitest';
import { createGame, getLegalActions } from './engine';
import type { Action, GameEvent, GameState } from './types';
import { act, choose, edit, newGame, place, res, setResources, setWorker, turnTo } from './testing';

const firstLegal = (s: GameState): Action => {
  const a = getLegalActions(s)[0];
  if (!a) throw new Error('Нет допустимых действий');
  return a;
};

const worker = (s: GameState, id: string) => s.workers.find((w) => w.id === id);

/** Все пасуют; решения по содержанию игроков, кроме `stopAt`, — «оплатить». Останов на содержании `stopAt`. */
function passUntilUpkeep(s: GameState, stopAt: number): GameState {
  const round = s.round;
  while (s.pending && s.round === round) {
    if (s.pending.kind === 'placement') s = act(s, { type: 'pass' });
    else if (s.pending.kind === 'upkeep' && s.pending.player === stopAt) return s;
    else s = act(s, firstLegal(s));
  }
  return s;
}

describe('Драфт: порядок кругов (Структура раунда, шаг 2)', () => {
  it.each([2, 3, 4])(
    'Драфт: круг 1 с первого игрока, круг 2 в обратном порядке (%i игроков)',
    (n) => {
      let s = createGame({ playerCount: n }, 3);
      const f = s.firstPlayer;
      const seen: { player: number; circle: number }[] = [];
      while (s.pending?.kind === 'draftPick') {
        seen.push({ player: s.pending.player, circle: s.pending.circle });
        s = act(s, firstLegal(s));
      }
      const order = Array.from({ length: n }, (_, k) => (f + k) % n);
      expect(seen).toEqual([
        ...order.map((player) => ({ player, circle: 1 })),
        ...[...order].reverse().map((player) => ({ player, circle: 2 })),
      ]);
    },
  );

  it('Драфт: взятое из выкладки недоступно следующему игроку', () => {
    let s = createGame({ playerCount: 3 }, 5);
    const character = s.offer.characters[0] as CharacterId;
    s = act(s, { type: 'draftPick', pick: { kind: 'character', character } });
    s = act(s, { type: 'draftPick', pick: { kind: 'profession', profession: 'spy' } });
    const legal = getLegalActions(s);
    expect(legal).toHaveLength(8);
    expect(legal).not.toContainEqual({ type: 'draftPick', pick: { kind: 'character', character } });
    expect(legal).not.toContainEqual({
      type: 'draftPick',
      pick: { kind: 'profession', profession: 'spy' },
    });
  });

  it('Профессии: запас не ограничен — в следующем раунде снова выкладываются все 5', () => {
    let s = createGame({ playerCount: 3, rules: { randomFirstPlayer: true } }, 7);
    while (s.round === 1 && s.pending) {
      // Пары назначаются рабочим (а не сбрасываются), чтобы проверить профессии во 2-м раунде.
      const assign = getLegalActions(s).find(
        (x) => x.type === 'upgrade' && x.choice.kind === 'assign',
      );
      const upkeep = getLegalActions(s).find((x) => x.type === 'upkeep' && x.choice === 'pay');
      s = act(
        s,
        s.pending.kind === 'placement' ? { type: 'pass' } : (assign ?? upkeep ?? firstLegal(s)),
      );
    }
    expect(s.round).toBe(2);
    // Даже если профессии взяты в 1-м раунде, выкладка 2-го раунда полная.
    expect(s.offer.professions).toEqual([...PROFESSION_ORDER]);
    expect(s.offer.characters).toHaveLength(5);
  });
});

describe('Улучшение: замена с отступными (Уточнения: «Замена улучшения»)', () => {
  it('Замена пары содержания 2: старая пара даёт 1 золото, событие с причиной replaced', () => {
    let s = createGame({ playerCount: 3 }, 2);
    const p = s.firstPlayer;
    s = edit(s, (d) => {
      d.deck = d.deck.filter((c) => c !== 'officer');
      const w = d.workers.find((x) => x.id === `p${p}w0`);
      if (!w) throw new Error('нет рабочего');
      w.character = 'officer';
      w.profession = 'guard';
    });
    while (s.pending?.kind === 'draftPick') s = act(s, firstLegal(s));
    expect(s.pending).toEqual({ kind: 'upgrade', player: p });
    const before = res(s, p).gold;
    const log: GameEvent[] = [];
    s = act(s, { type: 'upgrade', choice: { kind: 'assign', workerId: `p${p}w0` } }, log);
    expect(res(s, p).gold).toBe(before + 1);
    expect(s.discard).toContain('officer');
    expect(log).toContainEqual({
      type: 'pairDiscarded',
      player: p,
      character: 'officer',
      profession: 'guard',
      reason: 'replaced',
    });
  });
});

describe('Содержание: отступные и госпиталь (Структура раунда, шаг 6)', () => {
  /** p0w0 с персонажем; все пасуют до содержания p0. */
  const toUpkeep = (character: CharacterId, blood: number, hospital = false) => {
    let s = setWorker(newGame({}, 1), 'p0w0', { profession: 'guard', character });
    s = setResources(s, 0, { blood });
    if (hospital) {
      s = edit(s, (d) => {
        const w = d.workers.find((x) => x.id === 'p0w0');
        if (w) w.position = { kind: 'hospital' };
      });
    }
    return passUntilUpkeep(s, 0);
  };

  it('Сброс вместо оплаты по таблице: содержание 2 → 1 золото, 3 → ничего', () => {
    const officer = toUpkeep('officer', 5);
    const afterOfficer = act(officer, { type: 'upkeep', choice: 'discard' });
    expect(res(afterOfficer, 0)).toMatchObject({ gold: 2 + 1, blood: 5 });

    const manipulator = toUpkeep('manipulator', 5);
    const afterManipulator = act(manipulator, { type: 'upkeep', choice: 'discard' });
    expect(res(afterManipulator, 0)).toMatchObject({ gold: 2, ore: 0, blood: 5 });
    expect(worker(afterManipulator, 'p0w0')).toMatchObject({ character: null, profession: null });
  });

  it('Госпиталь −1: содержание 3 в госпитале стоит 2 крови, хватает ровно 2', () => {
    const s = toUpkeep('manipulator', 2, true);
    expect(getLegalActions(s)).toContainEqual({ type: 'upkeep', choice: 'pay' });
    expect(res(act(s, { type: 'upkeep', choice: 'pay' }), 0).blood).toBe(0);
  });

  it('Без госпиталя тот же персонаж за 2 крови не оплачивается (3 > 2)', () => {
    const s = toUpkeep('manipulator', 2, false);
    // Выбора нет: пара сброшена сразу, ожидание содержания p0 не наступило.
    expect(s.pending?.kind === 'upkeep' && s.pending.player === 0).toBe(false);
    expect(worker(s, 'p0w0')?.character).toBeNull();
  });

  it('OQ-18 (автор): игрок сам выбирает, кого оплатить, — сбросить первого и оплатить второго', () => {
    let s = newGame({}, 1);
    s = setWorker(s, 'p0w0', { profession: 'guard', character: 'officer' });
    s = setWorker(s, 'p0w1', { profession: 'spy', character: 'oreMiner' });
    s = setResources(s, 0, { blood: 2 });
    s = passUntilUpkeep(s, 0);
    expect(getLegalActions(s)).toContainEqual({ type: 'upkeep', choice: 'discard' });
    s = act(s, { type: 'upkeep', choice: 'discard' });
    expect(s.pending).toEqual({ kind: 'upkeep', player: 0, workerId: 'p0w1' });
    s = act(s, { type: 'upkeep', choice: 'pay' });
    expect(worker(s, 'p0w0')?.character).toBeNull();
    expect(worker(s, 'p0w1')?.character).toBe('oreMiner');
    expect(res(s, 0).blood).toBe(0);
  });

  it('OQ-18: при нехватке крови на двоих оплатить первого — второй сбрасывается', () => {
    let s = newGame({}, 1);
    s = setWorker(s, 'p0w0', { profession: 'guard', character: 'officer' });
    s = setWorker(s, 'p0w1', { profession: 'spy', character: 'oreMiner' });
    s = setResources(s, 0, { blood: 2 });
    s = passUntilUpkeep(s, 0);
    expect(s.pending).toEqual({ kind: 'upkeep', player: 0, workerId: 'p0w0' });
    s = act(s, { type: 'upkeep', choice: 'pay' });
    expect(res(s, 0).blood).toBe(0);
    // Для p0w1 крови нет — автосброс с отступными (содержание 2 → 1 золото).
    expect(worker(s, 'p0w1')?.character).toBeNull();
    expect(worker(s, 'p0w0')?.character).toBe('officer');
    expect(res(s, 0).gold).toBe(2 + 1);
  });
});

describe('Палач (Профессии)', () => {
  /** p1 с персонажем стоит в Ведьмином круге (слот 1), p0 — Палач. Жетоны профессий не совпадают с Палачом. */
  const setup = () => {
    let s = newGame({}, 1);
    s = setWorker(s, 'p1w0', { profession: 'spy', character: 'officer' });
    s = edit(s, (d) => {
      d.locations.mine.professionToken = 'guard';
      d.locations.witchCircle.professionToken = 'spy';
    });
    s = turnTo(s, 1);
    s = place(s, 'witchCircle', 1, { workerId: 'p1w0' });
    s = turnTo(s, 0);
    return setWorker(s, 'p0w0', { profession: 'executioner', character: 'bloodsucker' });
  };

  it('Палач: совпадение профессии с жетоном локации не нужно', () => {
    const s = place(setup(), 'mine', 1, { workerId: 'p0w0' });
    expect(getLegalActions(s)).toContainEqual({ type: 'executioner', target: 'p1w0' });
  });

  it('Палач: вытесненный рабочий платит содержание на 1 меньше (он в госпитале)', () => {
    let s = place(setup(), 'mine', 1, { workerId: 'p0w0' });
    s = act(s, { type: 'executioner', target: 'p1w0' });
    expect(worker(s, 'p1w0')?.position).toEqual({ kind: 'hospital' });
    s = setResources(s, 1, { blood: 1 });
    s = setResources(s, 0, { blood: 5 });
    s = passUntilUpkeep(s, 1);
    expect(s.pending).toEqual({ kind: 'upkeep', player: 1, workerId: 'p1w0' });
    s = act(s, { type: 'upkeep', choice: 'pay' });
    expect(res(s, 1).blood).toBe(0); // Офицер: 2 − 1 = 1
  });

  it('OQ-16 (автор, изменено 23.11): Палач, перешедший в первый слот вытеснением, выбивает и второго', () => {
    let s = newGame({}, 1);
    s = setWorker(s, 'p0w0', { profession: 'executioner', character: 'bloodsucker' });
    s = edit(s, (d) => {
      d.locations.mine.professionToken = 'executioner';
      for (const w of d.workers) {
        if (w.id === 'p2w0') w.position = { kind: 'slot', location: 'mine', slot: 1 };
        if (w.id === 'p1w0') w.position = { kind: 'slot', location: 'witchCircle', slot: 1 };
      }
    });
    s = turnTo(s, 0);
    const log: GameEvent[] = [];
    s = place(s, 'mine', 2, { workerId: 'p0w0', displace: true, log });
    expect(worker(s, 'p2w0')?.position).toEqual({ kind: 'hospital' });
    expect(s.pending?.kind).toBe('executioner');
    s = act(s, { type: 'executioner', target: 'p1w0' }, log);
    expect(worker(s, 'p1w0')?.position).toEqual({ kind: 'hospital' });
    expect(log.filter((e) => e.type === 'workerDisplaced')).toHaveLength(2);
    expect(res(s, 1).compromat).toBe(1); // от Палача — 1 компромат (автор, 23.11)
  });

  it('OQ-16: прежнее правило доступно переключателем', () => {
    let s = newGame({ rules: { executionerOnDisplacement: false } }, 1);
    s = setWorker(s, 'p0w0', { profession: 'executioner', character: 'bloodsucker' });
    s = edit(s, (d) => {
      d.locations.mine.professionToken = 'executioner';
      for (const w of d.workers) {
        if (w.id === 'p2w0') w.position = { kind: 'slot', location: 'mine', slot: 1 };
        if (w.id === 'p1w0') w.position = { kind: 'slot', location: 'witchCircle', slot: 1 };
      }
    });
    s = turnTo(s, 0);
    s = place(s, 'mine', 2, { workerId: 'p0w0', displace: true });
    expect(s.pending?.kind).not.toBe('executioner');
  });
});

describe('Таверна, первый слот (Локации)', () => {
  it('Таверна: полученная пара дальше определяет содержание (новый персонаж платит по своей карте)', () => {
    let s = setWorker(newGame({}, 1), 'p0w0', { profession: 'aristocrat', character: 'officer' });
    s = edit(s, (d) => {
      d.deck = d.deck.filter((c) => c !== 'bloodsucker' && c !== 'troublemaker');
      d.offer = { characters: ['bloodsucker', 'troublemaker'], professions: ['spy', 'guard'] };
    });
    s = setResources(s, 0, { blood: 5 });
    s = turnTo(s, 0);
    s = place(s, 'tavern', 1, { workerId: 'p0w0' });
    s = choose(s, { kind: 'tavernSwap', character: 'bloodsucker', profession: 'spy' });
    s = passUntilUpkeep(s, 0);
    expect(s.pending).toEqual({ kind: 'upkeep', player: 0, workerId: 'p0w0' });
    s = act(s, { type: 'upkeep', choice: 'pay' });
    expect(res(s, 0).blood).toBe(5); // Кровосос: содержание 0, а не 2 как у Офицера
  });

  it('Таверна: пул после драфта 3+3 при 2 игроках даёт 3 × 3 вариантов замены и пропуск', () => {
    let s = createGame({ playerCount: 2, rules: { randomFirstPlayer: true } }, 4);
    while (s.pending?.kind === 'draftPick') s = act(s, firstLegal(s));
    while (s.pending?.kind === 'upgrade') {
      s = act(s, {
        type: 'upgrade',
        choice: { kind: 'assign', workerId: `p${s.pending.player}w0` },
      });
    }
    const pl = s.pending?.kind === 'placement' ? s.pending.player : -1;
    s = place(s, 'tavern', 1, { workerId: `p${pl}w0` });
    const choices = getLegalActions(s).filter((a) => a.type === 'locationAction');
    expect(choices).toHaveLength(3 * 3 + 1);
  });
});
