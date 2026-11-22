import {
  applyAction,
  createGameWithEvents,
  decisionTitle,
  eventText,
  getObservation,
  type Action,
  type GameConfigInput,
  type GameState,
} from '@vampire/core';
import { useEffect, useRef, useState } from 'react';
import styles from './App.module.css';
import { Board } from './Board';
import { Draft } from './Draft';
import { EntryPrice } from './EntryPrice';
import { Icon, RichText } from './Icon';
import { playerName } from './labels';
import { PlayerBoard } from './PlayerBoard';

/** Файл партии агента (формат sim/src/agent.ts; здесь — только нужные поля). */
interface AgentGameFile {
  config: GameConfigInput;
  seed: number;
  seats: string[];
  actions: Action[];
  decisions: {
    index: number;
    round: number;
    title: string;
    options: string[];
    choice: number;
    why: string;
    shadowChoice: number;
  }[];
}

const PHASE_NAME: Record<string, string> = {
  draft: 'драфт',
  upgrade: 'улучшение',
  placement: 'размещение',
  combat: 'бои',
  upkeep: 'содержание',
  gameOver: 'партия окончена',
};

const POLL_MS = 2000;

function replay(g: AgentGameFile): { state: GameState; log: string[] } {
  const start = createGameWithEvents(g.config, g.seed);
  let state = start.state;
  const log: string[] = [];
  const push = (s: GameState, events: Parameters<typeof eventText>[1][]) => {
    for (const e of events) {
      const t = eventText(s, e);
      if (t) log.push(t);
    }
  };
  push(state, start.events);
  for (const a of g.actions) {
    const r = applyAction(state, a, { validate: false });
    state = r.state;
    push(state, r.events);
  }
  return { state, log };
}

/** ?watch=<файл.json> — живой просмотр партии агента: опрос файла раз в 2 секунды. */
export function Watch({ file }: { file: string }) {
  const [game, setGame] = useState<AgentGameFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const lastText = useRef('');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/agent-games/${encodeURIComponent(file)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Файл ${file}: ${res.status}`);
        const text = await res.text();
        if (!alive) return;
        if (text !== lastText.current) {
          lastText.current = text;
          setGame(JSON.parse(text) as AgentGameFile);
          setUpdated(new Date());
        }
        setError(null);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [file]);

  if (!game) return <div className={styles.app}>{error ?? `Загружаю ${file}…`}</div>;
  const { state, log } = replay(game);
  // Глазами агента, который сейчас ходит (за столом их может быть несколько), иначе первого.
  const pendingSeat = state.pending?.player;
  const agentSeat =
    pendingSeat !== undefined && game.seats[pendingSeat] === 'agent'
      ? pendingSeat
      : Math.max(0, game.seats.indexOf('agent'));
  const obs = getObservation(state, agentSeat);
  const seats = game.seats.map((s) => (s === 'agent' ? 'human' : s));
  const recent = [...game.decisions].reverse().slice(0, 12);
  const diffs = game.decisions.filter((d) => d.choice !== d.shadowChoice).length;

  return (
    <div className={styles.app}>
      <div className={styles.game}>
        <header className={styles.header}>
          <b>
            Раунд {state.round} / {state.config.rounds}
          </b>
          <span>фаза: {PHASE_NAME[state.phase] ?? state.phase}</span>
          <span>
            <Icon name="cityEntry" /> <EntryPrice view={state} />
          </span>
          <span>
            Наблюдение: {file} · смотрим глазами {playerName(agentSeat)} · ходов{' '}
            {game.actions.length} · решений агента {game.decisions.length}, расхождений с ботом{' '}
            {diffs}
          </span>
          <span className={styles.spacer} />
          <span className={styles.muted}>
            {error ? `ошибка: ${error}` : `обновлено ${updated?.toLocaleTimeString() ?? '—'}`}
          </span>
        </header>
        <main className={styles.main}>
          <div className={styles.left}>
            <Board obs={obs} placements={[]} onPlace={() => undefined} />
            <div className={styles.draftArea}>
              <Draft obs={obs} legal={[]} onPick={() => undefined} />
            </div>
          </div>
          <aside className={styles.side}>
            <div className={styles.turn}>
              <h3>
                <RichText text={decisionTitle(state)} />
              </h3>
              {recent.map((d) => (
                <div key={d.index} style={{ marginBottom: 8 }}>
                  <div className={styles.muted}>
                    #{d.index} · Р{d.round} · {d.title}
                    {d.choice !== d.shadowChoice ? ' · расхождение с ботом' : ''}
                  </div>
                  <div>
                    <b>
                      <RichText text={d.options[d.choice - 1] ?? '?'} />
                    </b>{' '}
                    — {d.why}
                  </div>
                  {d.choice !== d.shadowChoice && (
                    <div className={styles.muted}>
                      бот: <RichText text={d.options[d.shadowChoice - 1] ?? '?'} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <PlayerBoard obs={obs} state={state} defaultPlayer={agentSeat} seats={seats} />
            <details className={styles.log}>
              <summary>Журнал</summary>
              {log.slice(-200).map((l, i) => (
                <div key={i}>
                  <RichText text={l} />
                </div>
              ))}
            </details>
          </aside>
        </main>
      </div>
    </div>
  );
}
