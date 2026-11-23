import { BOT_FACTORIES } from '@vampire/bots';
import {
  applyAction,
  createGame,
  getScores,
  isTerminal,
  type CombatPlay,
  type GameEvent,
  type PlayerScore,
} from '@vampire/core';
import { writeFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BoardLastMove } from './board/BoardSvg';
import { CombatResultModal } from './CombatResultModal';
import { checkGuestView, renderScreen, SEATS } from './screenCheck';
import { screenView } from './view';

/**
 * Прогон интерфейса случайными ботами: после каждого хода весь экран партии рисуется теми же
 * компонентами, что в игре, и проверяется, что каждый допустимый ход достижим из интерфейса
 * (гнездо/участок на поле, карта драфта или кнопка строки решения).
 *
 * Обычный `npm test` его пропускает. Запуск:
 *   UI_STRESS=1000 [UI_STRESS_SEED=1] [UI_STRESS_BOT=random] npx vitest run packages/web/src/uiStress.test.tsx
 * Отчёт об ошибках — в файл из UI_STRESS_OUT (по умолчанию ui-stress-report.json в текущей папке).
 */

const COUNT = Number(process.env.UI_STRESS ?? 0);
const SEED = Number(process.env.UI_STRESS_SEED ?? 1);
const BOT = process.env.UI_STRESS_BOT ?? 'random';
const OUT = process.env.UI_STRESS_OUT ?? 'ui-stress-report.json';

interface Failure {
  seed: number;
  step: number;
  round: number;
  phase: string;
  pending: string;
  error: string;
}

function marks(events: readonly GameEvent[]): { slots: string[]; plots: string[] } {
  const slots: string[] = [];
  const plots: string[] = [];
  for (const e of events) {
    if (e.type === 'workerPlaced') slots.push(`${e.location}:${e.slot}`);
    if (e.type === 'buildingBuilt') plots.push(e.plot ?? `citadel:${e.region}`);
  }
  return { slots, plots };
}

describe.skipIf(COUNT <= 0)('Прогон интерфейса случайными ботами', () => {
  it(`${COUNT} партий: экран рисуется на каждом ходу, все ходы достижимы`, { timeout: 0 }, () => {
    const failures: Failure[] = [];
    let steps = 0;
    const started = Date.now();
    for (let g = 0; g < COUNT; g++) {
      const seed = SEED + g;
      let state = createGame({ playerCount: 3 }, seed);
      const bots = [0, 1, 2].map((i) => BOT_FACTORIES[BOT]!(seed * 10 + i));
      let lastMove: BoardLastMove | null = null;
      const roundStart: Record<number, PlayerScore[]> = {};
      let step = 0;
      const revealed: Partial<Record<string, CombatPlay[]>> = {};
      try {
        while (!isTerminal(state)) {
          roundStart[state.round] ??= getScores(state);
          const player = state.pending!.player;
          const view = screenView(state, SEATS, null, null);
          // Иногда — как будто выбран рабочий или раскрыты варианты одной цели.
          const reserve = view.obs.workers.find(
            (w) => w.owner === player && w.position.kind === 'reserve',
          );
          const multi = Object.values(view.slots).find((l) => l.length > 1);
          renderScreen(state, null, null, lastMove, roundStart[state.round - 1] ?? null);
          if (reserve && step % 3 === 0) renderScreen(state, reserve.id, null, lastMove, null);
          if (multi) renderScreen(state, null, multi, lastMove, null);
          for (const viewer of [0, 1, 2]) checkGuestView(state, viewer, seed * 1000 + step);

          const action = bots[player]!.chooseAction(view.obs, view.legal);
          const r = applyAction(state, action);
          // Окно итогов боя — для каждого разрешённого боя.
          for (const e of r.events) {
            if (e.type === 'combatTokensRevealed') revealed[e.region] = e.plays;
            if (e.type === 'combatResolved' && e.strengths.length > 0) {
              const report = {
                id: step,
                round: state.round,
                region: e.region,
                plays: revealed[e.region] ?? [],
                strengths: e.strengths,
                winner: e.winner,
              };
              renderToStaticMarkup(
                <CombatResultModal report={report} earlier={[]} viewer={0} onClose={() => {}} />,
              );
            }
          }
          const m = marks(r.events);
          if (m.slots.length + m.plots.length > 0) lastMove = { player, ...m };
          state = r.state;
          step++;
          steps++;
        }
        renderScreen(state, null, null, lastMove, null);
      } catch (e) {
        failures.push({
          seed,
          step,
          round: state.round,
          phase: state.phase,
          pending: state.pending?.kind ?? '-',
          error:
            e instanceof Error
              ? (e.stack ?? e.message).split('\n').slice(0, 4).join(' | ')
              : String(e),
        });
      }
    }
    const seconds = (Date.now() - started) / 1000;
    writeFileSync(OUT, JSON.stringify({ games: COUNT, steps, seconds, failures }, null, 2));
    console.log(
      `UI-прогон: ${COUNT} партий, ${steps} ходов, ${seconds.toFixed(0)} с, ошибок ${failures.length}`,
    );
    expect(failures.slice(0, 5)).toEqual([]);
  });
});
