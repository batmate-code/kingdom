import { firstLegalBot, type Bot } from '@vampire/bots';
import { isTerminal } from '@vampire/core';
import { describe, expect, it } from 'vitest';
import {
  botSeed,
  playGame,
  playRecordedGame,
  playWithBots,
  replay,
  runSimulation,
  summarize,
  toCsv,
  type GameResult,
} from './index';

describe('Симулятор', () => {
  it('playGame играет партию ботами до конца', () => {
    const state = playGame({ playerCount: 3 }, 7, [firstLegalBot, firstLegalBot, firstLegalBot]);
    expect(isTerminal(state)).toBe(true);
  });

  it('Партия детерминирована: те же config, seed и боты — тот же счёт и столько же ходов', () => {
    const bots = ['random', 'random-grouped', 'random'];
    const a = playRecordedGame({ playerCount: 3 }, 5, bots);
    const b = playRecordedGame({ playerCount: 3 }, 5, bots);
    expect(a.error).toBeNull();
    expect(a.scores).toHaveLength(3);
    expect(a.winners.length).toBeGreaterThan(0);
    expect(b.actions).toBe(a.actions);
    expect(b.scores).toEqual(a.scores);
  });

  it('Ошибка не роняет прогон: партия возвращается с текстом ошибки и записью ходов', () => {
    let n = 0;
    // Бот, который на 30-м ходу делает недопустимый ход.
    const broken: Bot = {
      name: 'broken',
      chooseAction: (obs, legal) =>
        ++n === 30
          ? { type: 'place', workerId: 'нет-такого', location: 'mine', slot: 1, displace: false }
          : firstLegalBot.chooseAction(obs, legal),
    };
    const r = playWithBots({ playerCount: 2 }, 4, [broken, broken], ['broken', 'broken']);
    expect(r.error).toMatch(/Недопустимое действие/);
    expect(r.record?.actions).toHaveLength(30);
    // Запись до ошибочного хода воспроизводится.
    const ok = { ...r.record!, actions: r.record!.actions.slice(0, 29) };
    expect(replay(ok).pending).not.toBeNull();
  });

  it('Сводка и CSV', () => {
    const { results, summary } = runSimulation({
      games: 5,
      bots: ['random', 'random'],
      baseSeed: 10,
    });
    expect(summary.games).toBe(5);
    expect(summary.errors).toBe(0);
    expect(summary.winRateBySeat.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    const csv = toCsv(results).trim().split('\n');
    expect(csv).toHaveLength(6);
    expect(csv[0]).toBe(
      'seed,players,actions,ms,winners,error,bot0,vp0,prestige0,rank0,bot1,vp1,prestige1,rank1',
    );
  });

  it('Seed ботов зависит от партии и кресла', () => {
    expect(botSeed(1, 0)).not.toBe(botSeed(1, 1));
    expect(botSeed(1, 0)).not.toBe(botSeed(2, 0));
    expect(botSeed(3, 2)).toBe(botSeed(3, 2));
  });

  it('Сводка: ничья делит победу поровну, партии с ошибкой не считаются', () => {
    const base = { playerCount: 2, bots: ['x', 'y'], actions: 1, ms: 1, scores: [] };
    const results: GameResult[] = [
      { ...base, seed: 1, winners: [0, 1], error: null },
      { ...base, seed: 2, winners: [0], error: null },
      { ...base, seed: 3, winners: [], error: 'сбой' },
    ];
    const s = summarize(results, 2);
    expect(s).toMatchObject({ games: 3, errors: 1, draws: 1 });
    expect(s.winRateBySeat).toEqual([0.75, 0.25]);
  });

  it('CSV экранирует запятые и кавычки в тексте ошибки', () => {
    const csv = toCsv([
      {
        seed: 1,
        playerCount: 2,
        bots: ['a', 'b'],
        actions: 0,
        ms: 0,
        scores: [],
        winners: [],
        error: 'плохо, "очень"',
      },
    ]);
    expect(csv.split('\n')[1]).toContain('"плохо, ""очень"""');
  });
});
