import type { GameState, PlayerScore } from '@vampire/core';
import { useEffect } from 'react';
import { Icon } from './Icon';
import { seatLabel } from './labels';
import { PLAYER_COLORS } from './players';
import round from './RoundModal.module.css';
import styles from './GameOverModal.module.css';

/** Имя игрока для заголовка: «Игрок 2» или «Вы». */
function who(player: number, viewer: number): string {
  return player === viewer ? 'Вы' : `Игрок ${player + 1}`;
}

/**
 * Конец партии (автор 24.11): победитель крупно и итоговая лесенка — ПО, из чего сложились, престиж
 * (первый тай-брейк). Закрыть — посмотреть поле; «Новая партия» — на экран настройки.
 */
export function GameOverModal({
  state,
  scores,
  seats,
  viewer,
  onClose,
  onNewGame,
  newGameLabel,
}: {
  state: GameState;
  scores: PlayerScore[];
  seats: readonly string[];
  viewer: number;
  onClose(): void;
  onNewGame(): void;
  newGameLabel: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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
  const winners = ladder.filter((s) => s.rank === 1);
  const top = winners[0];
  // Победитель определился тай-брейком (равные ПО у первых мест) — поясняем чем.
  const tiedOnVp = top !== undefined && ladder.some((s) => s.rank > 1 && s.vp === top.vp);
  const viewerWon = winners.some((s) => s.player === viewer);

  const headline =
    winners.length > 1
      ? `Ничья: ${winners.map((s) => who(s.player, viewer)).join(' и ')}`
      : top
        ? top.player === viewer
          ? 'Вы победили!'
          : `Победил Игрок ${top.player + 1}`
        : 'Партия окончена';

  return (
    <div className={round.backdrop} onClick={onClose}>
      <div
        className={`${round.dialog} ${styles.dialog}`}
        role="dialog"
        aria-label="Конец партии"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={round.kicker}>Партия окончена · {state.config.rounds} раундов</div>
        <h2
          className={`${round.round} ${viewerWon ? styles.won : ''}`}
          style={top && winners.length === 1 ? { color: PLAYER_COLORS[top.player] } : undefined}
        >
          {headline}
        </h2>
        {top && (
          <div className={styles.sub}>
            {top.vp} ПО
            {tiedOnVp && winners.length === 1 ? ' · при равных ПО решил престиж' : ''}
            {winners.length > 1 ? ' · равны ПО, престиж и Цитадель Города' : ''}
          </div>
        )}
        <ol className={round.ladder}>
          {ladder.map((s) => {
            const color = PLAYER_COLORS[s.player];
            return (
              <li
                key={s.player}
                className={`${round.row} ${s.rank === 1 ? styles.winner : ''}`}
                style={{ borderLeftColor: color }}
              >
                <span className={round.place}>{s.rank === 1 ? '♛' : s.rank}</span>
                <span className={round.dot} style={{ background: color }}>
                  {s.player + 1}
                </span>
                <span className={round.name}>
                  Игрок {s.player + 1}
                  <span className={round.seat}>
                    {s.player === viewer ? ' · вы' : seatLabel(seats[s.player])}
                  </span>
                </span>
                <span className={round.breakdown} title="Из чего сложились очки">
                  престиж {s.prestigeVp} · влияние {s.influenceVp}
                  {s.firstVp > 0 ? ` · первенство ${s.firstVp}` : ''}
                  {s.spireVp > 0 ? ` · Шпиль ${s.spireVp}` : ''}
                </span>
                <span className={round.same} title="Престиж на треке (первый тай-брейк)">
                  {s.prestige} престижа
                </span>
                <span className={round.vp}>
                  {s.vp} <Icon name="vp" size={28} />
                </span>
              </li>
            );
          })}
        </ol>
        <div className={styles.buttons}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            Посмотреть поле
          </button>
          <button type="button" className={round.go} onClick={onNewGame}>
            {newGameLabel} ▸
          </button>
        </div>
      </div>
    </div>
  );
}
