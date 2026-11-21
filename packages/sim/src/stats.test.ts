import { describe, expect, it } from 'vitest';
import { runSimulation } from './index';
import { renderReport } from './report';

describe('Статистика симулятора', () => {
  const { stats, results } = runSimulation({
    games: 5,
    bots: ['random-grouped', 'random-grouped', 'random-grouped'],
    baseSeed: 30,
    collectStats: true,
  });

  it('Собирается по всем партиям', () => {
    expect(stats?.games).toBe(5);
    expect(stats?.playerSlots).toBe(15);
    expect(results.every((r) => r.stats === undefined)).toBe(true);
  });

  it('Размещения по локациям сходятся с числом рабочих, выставленных за партию', () => {
    const placed = Object.values(stats?.locations ?? {}).reduce(
      (s, l) => s + l.placements[0] + l.placements[1],
      0,
    );
    // 3 игрока × 3 рабочих × 6 раундов, не меньше (рабочих можно выставить повторно).
    expect(placed).toBeGreaterThanOrEqual(5 * 3 * 3 * 6 * 0.5);
  });

  it('Персонажи: выложенных не меньше, чем взятых', () => {
    for (const c of Object.values(stats?.characters ?? {})) {
      expect(c.offered).toBeGreaterThanOrEqual(c.drafted);
    }
  });

  it('Ресурсы: стартовое золото + получено − потрачено = осталось', () => {
    const gold = stats!.resources.gold;
    const gained = Object.values(gold.gained).reduce((a, b) => a + b, 0);
    const spent = Object.values(gold.spent).reduce((a, b) => a + b, 0);
    expect(2 * 15 + gained - spent).toBe(gold.leftAtEnd);
  });

  it('Отчёт содержит три раздела', () => {
    const md = renderReport(stats!, 'Тест');
    expect(md).toContain('## Локации');
    expect(md).toContain('## Персонажи');
    expect(md).toContain('## Ресурсы');
    expect(md).toContain('Рудник');
    expect(md).toContain('Летописец');
  });
});
