import {
  determinize,
  getLegalActions,
  getObservation,
  getScores,
  type Action,
  type GameState,
  type PlayerScore,
} from '@vampire/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActionBar } from './ActionBar';
import { BoardSvg, type BoardLastMove } from './board/BoardSvg';
import { CombatModal } from './CombatModal';
import { DraftModal } from './DraftModal';
import { RoundModal } from './RoundModal';
import { HandPanel, PlayersPanel } from './SidePanel';
import { TurnToast } from './TurnToast';
import { screenView, targetHint, type RemoteSeat } from './view';

/**
 * Проверки экрана партии без браузера (для тестов): экран рисуется теми же компонентами, что
 * в игре; каждый допустимый ход должен быть достижим, а экран гостя онлайн-партии — совпадать
 * с настоящим.
 */

export const SEATS = ['human', 'human', 'human'] as const;

export const actionKey = (a: Action) => JSON.stringify(a);

/** Весь экран для состояния (как в Game), без браузера. */
export function renderScreen(
  state: GameState,
  selected: string | null,
  focus: Action[] | null,
  lastMove: BoardLastMove | null,
  previous: PlayerScore[] | null,
  remote: RemoteSeat | null = null,
): string {
  const view = screenView(state, SEATS, selected, focus, remote);
  const { viewer, obs, legal, slots, plots, barLegal, strengths, drafting } = view;
  const noop = () => undefined;
  const targets =
    Object.keys(slots).length + Object.keys(plots).length > 0
      ? { slots, plots, hint: (a: Action[]) => targetHint(state, viewer, a), onPick: noop }
      : undefined;
  const html = renderToStaticMarkup(
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
      for (const a of list) reachable.add(actionKey(a));
    }
    for (const a of legal) {
      if (a.type === 'draftPick') {
        const ok =
          a.pick.kind === 'character'
            ? obs.offer.characters.includes(a.pick.character)
            : obs.offer.professions.includes(a.pick.profession);
        if (!ok) throw new Error(`карта драфта не показана: ${actionKey(a)}`);
        continue;
      }
      // Жетоны боя выбираются в окне боя: кнопка есть у каждого жетона из руки.
      if (a.type === 'combatToken') {
        if (
          state.pending?.kind !== 'combatToken' ||
          !(obs.players[viewer]?.combatTokens.hand[a.token] ?? 0)
        )
          throw new Error(`жетон боя не показан: ${actionKey(a)}`);
        continue;
      }
      if (!reachable.has(actionKey(a)))
        throw new Error(`ход недоступен из интерфейса: ${actionKey(a)}`);
    }
    for (const a of reachable) {
      if (!legal.some((x) => actionKey(x) === a))
        throw new Error(`интерфейс предлагает недопустимый ход: ${a}`);
    }
  }
  return html;
}

/**
 * Онлайн: экран игрока viewer из настоящего состояния и экран гостя из determinize его
 * наблюдения должны совпасть. Расхождение — экран показывает то, что зависит от скрытого.
 */
export function checkGuestView(state: GameState, viewer: number, seed: number): void {
  const remote: RemoteSeat = {
    viewer,
    legal: state.pending?.player === viewer ? getLegalActions(state) : [],
  };
  const real = renderScreen(state, null, null, null, null, remote);
  const guest = renderScreen(
    determinize(getObservation(state, viewer), seed),
    null,
    null,
    null,
    null,
    remote,
  );
  if (real !== guest) {
    let i = 0;
    while (i < real.length && real[i] === guest[i]) i++;
    throw new Error(
      `экран гостя ${viewer} отличается от настоящего: …${real.slice(Math.max(0, i - 80), i + 80)}… / …${guest.slice(Math.max(0, i - 80), i + 80)}…`,
    );
  }
}
