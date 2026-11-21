import { LOCATION_ORDER, PROFESSION_ORDER } from '@vampire/data';
import { describe, expect, it } from 'vitest';
import { getLegalActions, isTerminal } from './engine';
import type { GameEvent } from './types';
import { edit, moveWorker, newGame, passAll, place, setWorker, turnTo } from './testing';

describe('Подготовка раунда', () => {
  it('На каждую локацию открыто кладётся жетон профессии: 10 жетонов, по 2 каждой профессии', () => {
    let s = newGame();
    for (let round = 1; round <= 3; round++) {
      const tokens = LOCATION_ORDER.map((l) => s.locations[l].professionToken);
      for (const p of PROFESSION_ORDER) expect(tokens.filter((t) => t === p)).toHaveLength(2);
      s = passAll(s);
    }
  });

  it('Первый игрок в 1-м раунде случаен, но определяется seed', () => {
    const firsts = new Set(Array.from({ length: 30 }, (_, seed) => newGame({}, seed).firstPlayer));
    expect(firsts.size).toBe(3);
    expect(newGame({}, 7).firstPlayer).toBe(newGame({}, 7).firstPlayer);
  });

  it('Размещение начинается с первого игрока', () => {
    const s = newGame({}, 11);
    expect(s.pending).toEqual({ kind: 'placement', player: s.firstPlayer });
  });
});

describe('Конец раунда', () => {
  it('Все рабочие возвращаются в запас — с поля и из госпиталя', () => {
    let s = moveWorker(newGame(), 'p0w0', { kind: 'hospital' });
    s = moveWorker(s, 'p1w0', { kind: 'slot', location: 'mine', slot: 1 });
    s = passAll(s);
    expect(s.workers.every((w) => w.position.kind === 'reserve')).toBe(true);
  });

  it('Снимаются замки и жетоны силы', () => {
    let s = edit(newGame(), (d) => {
      d.locations.mine.slot2Locked = true;
      d.powerTokens.push({ owner: 0, region: 'forest', count: 1 });
    });
    s = passAll(s);
    expect(s.locations.mine.slot2Locked).toBe(false);
    expect(s.powerTokens).toEqual([]);
  });

  it('Логово: +1 руда в копилку, если второй слот никто не занял', () => {
    let s = passAll(newGame());
    expect(s.lair.stash).toBe(1);
    s = passAll(s);
    expect(s.lair.stash).toBe(2);
  });

  it('Логово (автор, 22.11): копилка растёт и при посещении первого слота', () => {
    let s = edit(turnTo(newGame(), 0), (d) => {
      d.lair.stash = 2;
    });
    s = place(s, 'lair', 1);
    s = passAll(s);
    expect(s.lair.stash).toBe(3);
  });

  it('Логово: копилка не растёт, если второй слот заняли (копилку забрали — с нуля)', () => {
    let s = edit(turnTo(newGame(), 0), (d) => {
      d.lair.stash = 2;
    });
    s = place(s, 'lair', 2);
    s = passAll(s);
    expect(s.lair.stash).toBe(0);
  });

  it('Первый игрок переходит по часовой стрелке', () => {
    const s0 = newGame({}, 3);
    const s1 = passAll(s0);
    expect(s1.round).toBe(2);
    expect(s1.firstPlayer).toBe((s0.firstPlayer + 1) % 3);
    expect(s1.pending).toEqual({ kind: 'placement', player: s1.firstPlayer });
  });

  it('Пас сбрасывается в начале нового раунда', () => {
    const s = passAll(newGame());
    expect(s.players.every((p) => !p.passed)).toBe(true);
  });

  it('После 6-го раунда партия окончена', () => {
    const log: GameEvent[] = [];
    let s = newGame();
    for (let i = 0; i < 6; i++) s = passAll(s, log);
    expect(isTerminal(s)).toBe(true);
    expect(s.round).toBe(6);
    expect(getLegalActions(s)).toEqual([]);
    expect(log.filter((e) => e.type === 'roundEnded')).toHaveLength(6);
    expect(log.at(-1)).toEqual({ type: 'gameOver' });
  });

  it('Улучшение (персонаж + профессия) сохраняется между раундами, если содержание оплачено', () => {
    let s = setWorker(newGame(), 'p0w0', { profession: 'spy', character: 'officer' });
    s = edit(s, (d) => {
      (d.players[0] as (typeof d.players)[number]).resources.blood = 5;
    });
    s = passAll(s);
    expect(s.workers.find((w) => w.id === 'p0w0')).toMatchObject({
      profession: 'spy',
      character: 'officer',
    });
  });
});
