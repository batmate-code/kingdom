import { seatLabel } from './labels';
import type { GameState, PlayerScore } from '@vampire/core';
import { useEffect } from 'react';
import { PLAYER_COLORS } from './players';
import { Icon } from './Icon';
import styles from './RoundModal.module.css';

/**
 * Начало раунда (решение автора 23.11): крупно номер раунда и вертикальная лесенка игроков по ПО —
 * место, очки, из чего сложились, сколько набрано за прошлый раунд. Enter / Esc / кнопка — дальше.
 */
export function RoundModal({
  state,
  scores,
  previous,
  seats,
  viewer,
  onClose,
}: {
  state: GameState;
  scores: PlayerScore[];
  /** Очки на начало прошлого раунда (для «+N за раунд»); null — первый раунд. */
  previous: PlayerScore[] | null;
  seats: readonly string[];
  viewer: number;
  onClose(): void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ladder = [...scores].sort(
    (a, b) => a.rank - b.rank || b.vp - a.vp || b.prestige - a.prestige,
  );
  const last = state.round === state.config.rounds;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-label="Новый раунд"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.kicker}>{last ? 'Последний раунд' : 'Новый раунд'}</div>
        <h2 className={styles.round}>
          Раунд {state.round} <span className={styles.of}>из {state.config.rounds}</span>
        </h2>
        <ol className={styles.ladder}>
          {ladder.map((s) => {
            const before = previous?.find((p) => p.player === s.player);
            const gained = before ? s.vp - before.vp : null;
            const color = PLAYER_COLORS[s.player];
            return (
              <li key={s.player} className={styles.row} style={{ borderLeftColor: color }}>
                <span className={styles.place}>{s.rank}</span>
                <span className={styles.dot} style={{ background: color }}>
                  {s.player + 1}
                </span>
                <span className={styles.name}>
                  Игрок {s.player + 1}
                  <span className={styles.seat}>
                    {s.player === viewer ? ' · вы' : seatLabel(seats[s.player])}
                  </span>
                  {/* Кто ходит первым в этом раунде (автор 24.11). */}
                  {s.player === state.firstPlayer && (
                    <span className={styles.first} title="Ходит первым в этом раунде">
                      первый
                    </span>
                  )}
                </span>
                <span className={styles.breakdown} title="Из чего сложились очки">
                  престиж {s.prestigeVp} · влияние {s.influenceVp}
                  {s.firstVp > 0 ? ` · первенство ${s.firstVp}` : ''}
                </span>
                {gained !== null && (
                  <span className={gained > 0 ? styles.gain : styles.same} title="За прошлый раунд">
                    {gained > 0 ? `+${gained}` : '±0'}
                  </span>
                )}
                <span className={styles.vp}>
                  {s.vp} <Icon name="vp" size={28} />
                </span>
              </li>
            );
          })}
        </ol>
        <button type="button" className={styles.go} onClick={onClose}>
          К драфту ▸
        </button>
      </div>
    </div>
  );
}
