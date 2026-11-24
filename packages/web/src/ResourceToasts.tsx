import { useEffect, useRef, useState } from 'react';
import { summarizeEvents, type FeedLine } from './feed';
import { RichText } from './Icon';
import { playerName } from './labels';
import { PLAYER_COLORS } from './players';
import styles from './ResourceToasts.module.css';
import { useGame } from './store';

/** Сколько держится тост, мс (совпадает с анимацией в CSS). */
const SHOW_MS = 5000;
/** Сколько тостов на экране одновременно: старые уходят первыми. */
const MAX_TOASTS = 5;

interface Toast extends FeedLine {
  id: number;
}

/**
 * Тосты справа внизу поля (решение автора 23.11): кто что получил или потратил за ход —
 * ресурсы, влияние, престиж. Не перехватывают клики, исчезают сами.
 */
export function ResourceToasts() {
  const feed = useGame((s) => s.feed);
  const viewer = useGame((s) => s.guest?.seat ?? null);
  const seats = useGame((s) => s.seats);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!feed) return;
    const fresh = summarizeEvents(feed.events).map((line) => ({ ...line, id: seq.current++ }));
    if (fresh.length === 0) return;
    setToasts((list) => [...list, ...fresh].slice(-MAX_TOASTS));
    // У каждой порции тостов свой таймер: новые ходы не продлевают жизнь старым.
    const ids = new Set(fresh.map((t) => t.id));
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setToasts((list) => list.filter((t) => !ids.has(t.id)));
    }, SHOW_MS);
    timers.current.add(timer);
  }, [feed]);

  // Уход с экрана партии — снять все таймеры.
  useEffect(() => {
    const all = timers.current;
    return () => all.forEach((t) => clearTimeout(t));
  }, []);

  if (toasts.length === 0) return null;
  // «Вы» — у гостя своё кресло, у хоста — люди за этим экраном.
  const isMe = (p: number) => (viewer !== null ? p === viewer : seats[p] === 'human');
  return (
    <div className={styles.stack} aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={styles.toast}
          style={{ borderLeftColor: PLAYER_COLORS[t.player] }}
        >
          <span className={styles.dot} style={{ background: PLAYER_COLORS[t.player] }}>
            {t.player + 1}
          </span>
          <span className={styles.who}>{isMe(t.player) ? 'Вы' : playerName(t.player)}</span>
          <span className={styles.text}>
            <RichText text={t.text} />
          </span>
        </div>
      ))}
    </div>
  );
}
