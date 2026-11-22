import { BOT_FACTORIES } from '@vampire/bots';
import {
  applyAction,
  createGame,
  getLegalActions,
  getObservation,
  isTerminal,
} from '@vampire/core';
import type { GameState, Observation } from '@vampire/core';
import { useMemo } from 'react';
import { HandPanel, PlayersPanel } from '../SidePanel';
import { BoardSvg } from './BoardSvg';
import { MapBoard } from './MapBoard';

/**
 * ?mock=board | ?mock=map | ?mock=mix | ?mock=layout [&steps=N] — макеты нового поля для согласования
 * с автором (не используются в игре): map — по наброску автора, mix — схема с пейзажем,
 * layout — mix внутри раскладки игрового экрана (шапка, правая колонка, тонкая строка решения).
 * Партия из трёх ботов, доигранная на N ходов, чтобы на поле были рабочие и здания.
 */
export function BoardMock() {
  const params = new URLSearchParams(window.location.search);
  const steps = Number(params.get('steps') ?? 120);
  const map = params.get('mock') === 'map';
  const mix = params.get('mock') === 'mix';
  const layout = params.get('mock') === 'layout';
  const { obs, state } = useMemo(() => {
    let s = createGame({ playerCount: 3 }, 7);
    const bots = [0, 1, 2].map((i) => BOT_FACTORIES['random-grouped']!(70 + i));
    for (let i = 0; i < steps && !isTerminal(s); i++) {
      const p = s.pending!.player;
      s = applyAction(s, bots[p]!.chooseAction(getObservation(s, p), getLegalActions(s))).state;
    }
    return { obs: getObservation(s, 0), state: s };
  }, [steps]);
  if (layout || params.get('mock') === 'panel') return <LayoutMock obs={obs} state={state} />;
  return (
    <div style={{ height: '100vh', background: '#07050a' }}>
      {map ? <MapBoard obs={obs} /> : <BoardSvg obs={obs} landscape={mix} />}
    </div>
  );
}

/** Раскладка экрана: поле получает всю высоту, кроме шапки и тонкой строки решения. */
function LayoutMock({ obs, state }: { obs: Observation; state: GameState }) {
  return (
    <div
      style={{
        height: '100vh',
        display: 'grid',
        gridTemplateRows: '40px 1fr 56px',
        gridTemplateColumns: 'minmax(0, 1fr) clamp(320px, 26vw, 640px)',
        background: '#07050a',
        color: '#ece6f2',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <header
        style={{
          gridColumn: '1 / 3',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '0 12px',
          borderBottom: '1px solid #3a3244',
          fontSize: 13,
        }}
      >
        <b>Раунд {obs.round} / 6</b>
        <span style={{ flex: 1 }} />
        <span style={{ color: '#9a90a6' }}>⚙ меню</span>
      </header>
      <main style={{ gridColumn: '1', gridRow: '2', minHeight: 0, minWidth: 0 }}>
        <BoardSvg obs={obs} landscape />
      </main>
      <aside
        style={{
          gridColumn: '2',
          gridRow: '2 / 4',
          borderLeft: '1px solid #3a3244',
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          overflowY: 'auto',
          minHeight: 0,
        }}
      >
        <HandPanel obs={obs} player={0} active selected={null} onSelect={() => undefined} />
        <PlayersPanel
          obs={obs}
          state={state}
          viewer={0}
          seats={['human', 'heuristic', 'heuristic']}
        />
      </aside>
      <footer
        style={{
          gridColumn: '1',
          gridRow: '3',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 12px',
          borderTop: '2px solid #b0405a',
          background: '#211c28',
          fontSize: 15,
        }}
      >
        <b>Игрок 1: размещение</b>
        <span style={{ color: '#9a90a6' }}>Выберите рабочего и подсвеченный слот</span>
      </footer>
    </div>
  );
}
