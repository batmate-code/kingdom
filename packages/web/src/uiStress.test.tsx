import { BOT_FACTORIES } from '@vampire/bots';
import {
  applyAction,
  createGame,
  getScores,
  isTerminal,
  type Action,
  type CombatPlay,
  type GameEvent,
  type GameState,
  type PlayerScore,
} from '@vampire/core';
import { writeFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActionBar } from './ActionBar';
import { BoardSvg, type BoardLastMove } from './board/BoardSvg';
import { CombatModal } from './CombatModal';
import { CombatResultModal } from './CombatResultModal';
import { DraftModal } from './DraftModal';
import { RoundModal } from './RoundModal';
import { HandPanel, PlayersPanel } from './SidePanel';
import { TurnToast } from './TurnToast';
import { screenView, targetHint } from './view';

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
const SEATS = ['human', 'human', 'human'] as const;

interface Failure {
  seed: number;
  step: number;
  round: number;
  phase: string;
  pending: string;
  error: string;
}

const key = (a: Action) => JSON.stringify(a);

function marks(events: readonly GameEvent[]): { slots: string[]; plots: string[] } {
  const slots: string[] = [];
  const plots: string[] = [];
  for (const e of events) {
    if (e.type === 'workerPlaced') slots.push(`${e.location}:${e.slot}`);
    if (e.type === 'buildingBuilt') plots.push(e.plot ?? `citadel:${e.region}`);
  }
  return { slots, plots };
}

/** Весь экран для состояния (как в Game), без браузера. */
function renderScreen(
  state: GameState,
  selected: string | null,
  focus: Action[] | null,
  lastMove: BoardLastMove | null,
  previous: PlayerScore[] | null,
): void {
  const view = screenView(state, SEATS, selected, focus);
  const { viewer, obs, legal, slots, plots, barLegal, strengths, drafting } = view;
  const noop = () => undefined;
  const targets =
    Object.keys(slots).length + Object.keys(plots).length > 0
      ? { slots, plots, hint: (a: Action[]) => targetHint(state, viewer, a), onPick: noop }
      : undefined;
  renderToStaticMarkup(
    <div>
      <BoardSvg obs={obs} landscape targets={targets} lastMove={lastMove} strengths={strengths} />
      <TurnToast player={state.pending?.player ?? null} phase={state.phase} human />
      <CombatModal
        state={state}
        obs={obs}
        legal={legal}
        strengths={strengths}
        viewer={viewer}
        onPick={noop}
      />
      {drafting && (
        <DraftModal
          state={state}
          obs={obs}
          legal={legal}
          onPick={noop}
          viewer={viewer}
          pendingPlayer={state.pending?.player ?? null}
        />
      )}
      <RoundModal
        state={state}
        scores={getScores(state)}
        previous={previous}
        seats={SEATS}
        viewer={viewer}
        onClose={noop}
      />
      <HandPanel obs={obs} player={viewer} active selected={selected} onSelect={noop} />
      <PlayersPanel obs={obs} state={state} viewer={viewer} seats={SEATS} />
      <ActionBar
        state={state}
        legal={barLegal}
        botTurn={false}
        hint={null}
        error={null}
        onAct={noop}
        onCancel={focus ? noop : undefined}
      />
    </div>,
  );

  // Каждый допустимый ход достижим из интерфейса.
  if (!focus && !selected) {
    const reachable = new Set<string>();
    for (const list of [...Object.values(slots), ...Object.values(plots), barLegal]) {
      for (const a of list) reachable.add(key(a));
    }
    for (const a of legal) {
      if (a.type === 'draftPick') {
        const ok =
          a.pick.kind === 'character'
            ? obs.offer.characters.includes(a.pick.character)
            : obs.offer.professions.includes(a.pick.profession);
        if (!ok) throw new Error(`карта драфта не показана: ${key(a)}`);
        continue;
      }
      // Жетоны боя выбираются в окне боя: кнопка есть у каждого жетона из руки.
      if (a.type === 'combatToken') {
        if (
          state.pending?.kind !== 'combatToken' ||
          !(obs.players[viewer]?.combatTokens.hand[a.token] ?? 0)
        )
          throw new Error(`жетон боя не показан: ${key(a)}`);
        continue;
      }
      if (!reachable.has(key(a))) throw new Error(`ход недоступен из интерфейса: ${key(a)}`);
    }
    for (const a of reachable) {
      if (!legal.some((x) => key(x) === a))
        throw new Error(`интерфейс предлагает недопустимый ход: ${a}`);
    }
  }
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
