import { describe, expect, it } from 'vitest';
import { determinize } from './determinize';
import { applyAction, createGame, getLegalActions, getObservation, isTerminal } from './engine';
import { randomInt, seedToState } from './rng';
import type { GameEvent, GameState } from './types';
import { eventsFor, eventVisibility, filterEvents, type VisibilityTable } from './visibility';

/** Случайная партия: на каждом ходу — (состояние до хода, события хода). */
function* randomGame(seed: number): Generator<{ before: GameState; events: GameEvent[] }> {
  let s = createGame({ playerCount: 3 }, seed);
  const rng = { rng: seedToState(seed * 7) };
  while (!isTerminal(s)) {
    const legal = getLegalActions(s);
    const action = legal[randomInt(rng, legal.length)]!;
    const r = applyAction(s, action);
    yield { before: s, events: r.events };
    s = r.state;
  }
}

describe('Видимость для онлайн-режима', () => {
  it('Фильтр событий: public — всем, own — только своему игроку, hidden — никому', () => {
    const events: GameEvent[] = [
      { type: 'passed', player: 0 },
      { type: 'passed', player: 1 },
      { type: 'roundEnded', round: 1 },
      { type: 'gameOver' },
    ];
    const table = {
      ...Object.fromEntries(events.map((e) => [e.type, 'public'])),
      passed: 'own',
      roundEnded: 'hidden',
      gameOver: 'public',
    } as VisibilityTable;
    expect(filterEvents(events, 1, table)).toEqual([
      { type: 'passed', player: 1 },
      { type: 'gameOver' },
    ]);
    expect(filterEvents(events, 2, table)).toEqual([{ type: 'gameOver' }]);
  });

  it('Сейчас все события открыты: зритель получает поток событий целиком', () => {
    for (const { events } of randomGame(11)) {
      for (const e of events) expect(eventVisibility(e.type)).toBe('public');
      expect(eventsFor(events, 0)).toEqual(events);
    }
  });

  it('Жетон боя до вскрытия: событие не называет жетон', () => {
    for (const { events } of randomGame(12)) {
      for (const e of events) {
        if (e.type === 'combatTokenPlayed')
          expect(Object.keys(e).sort()).toEqual(['player', 'region', 'type']);
      }
    }
  });

  it('determinize: наблюдение гостя восстанавливается без лишнего (на каждом ходу, каждому игроку)', () => {
    let steps = 0;
    for (const { before } of randomGame(13)) {
      for (const viewer of [0, 1, 2]) {
        const obs = getObservation(before, viewer);
        const guest = determinize(obs, steps * 3 + viewer);
        const back = getObservation(guest, viewer);
        // config отличается только выключенной проверкой инвариантов.
        expect({ ...back, config: obs.config }).toEqual(obs);
      }
      steps++;
    }
    expect(steps).toBeGreaterThan(100);
  });

  it('Снимок для сети: в наблюдении нет колоды и генератора, чужие жетоны до вскрытия — null', () => {
    for (const { before } of randomGame(14)) {
      for (const viewer of [0, 1, 2]) {
        const snapshot = JSON.parse(JSON.stringify(getObservation(before, viewer))) as Record<
          string,
          unknown
        >;
        expect(snapshot).not.toHaveProperty('deck');
        expect(snapshot).not.toHaveProperty('rng');
        const combat = before.combat;
        if (combat && !combat.revealed) {
          const plays = (snapshot.combat as { plays: { player: number; token: unknown }[] }).plays;
          for (const p of plays) {
            if (p.player !== viewer) expect(p.token).toBeNull();
          }
        }
      }
    }
  });
});
