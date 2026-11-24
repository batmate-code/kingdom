import { PLAYER_COLORS } from './players';
import { playerName } from './labels';
import styles from './UndoVoteModal.module.css';
import { useGame } from './store';

/**
 * Онлайн: просьба отменить ход (решение автора 23.11). Отмену подтверждают все игроки: окно
 * показывает, кто просит и что откатится (строки журнала); пока окно открыто, боты ждут.
 */
export function UndoVoteModal() {
  const { undoVote: vote, guest, seats, answerUndo } = useGame();
  if (!vote) return null;
  // Чьими глазами: гость — своё кресло, хост — все люди за этим экраном.
  const mine = guest ? [guest.seat] : seats.flatMap((s, i) => (s === 'human' ? [i] : []));
  const isRequester = mine.includes(vote.requester);
  const myTurnToAnswer = vote.need.some((n) => mine.includes(n) && !vote.approved.includes(n));
  const waiting = vote.need.filter((n) => !vote.approved.includes(n));
  const who = (seat: number) => (mine.includes(seat) ? 'вы' : playerName(seat));

  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog} role="dialog" aria-label="Отмена хода">
        <h2 className={styles.title}>
          <span className={styles.dot} style={{ background: PLAYER_COLORS[vote.requester] }}>
            {vote.requester + 1}
          </span>
          {isRequester
            ? 'Вы просите отменить свой ход'
            : `${playerName(vote.requester)} просит отменить свой ход`}
        </h2>
        <p className={styles.note}>
          Откатится {vote.lines.length > 0 ? 'всё это' : 'последний ход'} — партия вернётся к
          моменту перед ходом {isRequester ? 'вашим' : `игрока ${vote.requester + 1}`}:
        </p>
        <ol className={styles.lines}>
          {vote.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
        <p className={styles.status}>
          {waiting.length > 0 ? `Ждём согласия: ${waiting.map(who).join(', ')}` : 'Все согласились'}
        </p>
        <div className={styles.buttons}>
          {myTurnToAnswer && (
            <>
              <button type="button" className={styles.yes} onClick={() => answerUndo(true)}>
                Согласиться
              </button>
              <button type="button" onClick={() => answerUndo(false)}>
                Отказаться
              </button>
            </>
          )}
          {isRequester && !myTurnToAnswer && (
            <button type="button" onClick={() => answerUndo(false)}>
              Отозвать просьбу
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
