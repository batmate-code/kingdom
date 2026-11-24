import { getLegalActions, type GameState } from '@vampire/core';
import { describe, expect, it } from 'vitest';
import { DONE, stepOptions } from './choiceSteps';
import { useGame } from './store';

/** Партия, где игрок 0 стоит в первом слоте Канцелярии с 2 компроматами. */
function chancery(): GameState {
  useGame.getState().start(['human', 'human', 'human'], 3);
  const s = structuredClone(useGame.getState().state!) as GameState;
  s.players[0]!.resources = { gold: 1, blood: 0, ore: 0, compromat: 4 };
  s.pending = {
    kind: 'locationAction',
    player: 0,
    context: { workerId: 'p0w0', location: 'chancery', slot: 1, copy: false },
  };
  s.workers.find((w) => w.id === 'p0w0')!.position = {
    kind: 'slot',
    location: 'chancery',
    slot: 1,
  };
  return s;
}

describe('Окно выбора: шаги вложенного выбора', () => {
  it('Канцелярия: сначала первое действие, затем второе или «Готово»', () => {
    const s = chancery();
    const legal = getLegalActions(s).filter((a) => a.type === 'locationAction');
    const first = stepOptions(s, legal, []);
    const ore = first.find((o) => o.label.startsWith('2 комп →'))?.label;
    expect(ore).toBeDefined();
    const second = stepOptions(s, legal, [ore!]);
    expect(second.map((o) => o.label)).toContain(DONE);
    expect(second.map((o) => o.label)).toContain(ore);
    expect(second.every((o) => o.action !== null)).toBe(true);
    // Порядок не важен: после руды можно взять и золото/кровь.
    expect(second.map((o) => o.label).some((l) => l.includes('зол'))).toBe(true);
  });

  it('Ратуша: сначала обмен, регионы — только на втором шаге', () => {
    const s = chancery();
    s.players[0]!.resources = { gold: 0, blood: 0, ore: 2, compromat: 0 };
    s.pending = {
      kind: 'locationAction',
      player: 0,
      context: { workerId: 'p0w0', location: 'cityHall', slot: 1, copy: false },
    };
    s.workers.find((w) => w.id === 'p0w0')!.position = {
      kind: 'slot',
      location: 'cityHall',
      slot: 1,
    };
    const legal = getLegalActions(s).filter((a) => a.type === 'locationAction');
    const first = stepOptions(s, legal, []).map((o) => o.label);
    expect(first.some((l) => l === 'Лес')).toBe(false);
    expect(stepOptions(s, legal, [first[0]!]).map((o) => o.label)).toContain('Лес');
  });
});
