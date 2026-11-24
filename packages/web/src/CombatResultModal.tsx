import { COMBAT_REWARD, COMBAT_TOKENS, REGIONS } from '@vampire/data';
import { useEffect } from 'react';
import { PLAYER_COLORS } from './players';
import base from './CombatModal.module.css';
import { TOKEN_IMG } from './CombatModal';
import styles from './CombatResultModal.module.css';
import { playerName } from './labels';
import type { CombatReport } from './store';

/**
 * Итоги боя (решение автора 23.11): после вскрытия жетонов и до награды за бой — кто что
 * сыграл, итоговые силы и победитель. Боты ждут, пока окно открыто; Enter/Esc — дальше.
 */
export function CombatResultModal({
  report,
  earlier,
  viewer,
  onClose,
}: {
  report: CombatReport;
  /** Уже прошедшие бои этого раунда — для полосы Лес → Долина → Город. */
  earlier: CombatReport[];
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

  const regionIdx = REGIONS.findIndex((r) => r.id === report.region);
  const players = [
    ...new Set([...report.strengths.map((s) => s.player), ...report.plays.map((p) => p.player)]),
  ];
  const rows = players
    .map((player) => ({
      player,
      token: report.plays.find((p) => p.player === player)?.token ?? null,
      strength: report.strengths.find((s) => s.player === player)?.strength ?? null,
    }))
    .sort((a, b) => (b.strength ?? -1) - (a.strength ?? -1));
  const winner = report.winner;
  const domination =
    winner !== null && report.plays.some((p) => p.player === winner && p.token === 'domination');
  const gain = COMBAT_REWARD.influence + (domination ? COMBAT_REWARD.dominationInfluence : 0);
  const who = (p: number) => (p === viewer ? 'Вы' : playerName(p));

  return (
    <div className={base.backdrop} onClick={onClose}>
      <div
        className={`${base.dialog} ${base[report.region]} ${styles.dialog}`}
        role="dialog"
        aria-label="Итоги боя"
        onClick={(e) => e.stopPropagation()}
      >
        <ol className={`${base.steps} ${styles.steps}`}>
          {REGIONS.map((r, i) => {
            const past = earlier.find((x) => x.region === r.id);
            const w = i === regionIdx ? winner : past?.winner;
            return (
              <li
                key={r.id}
                className={i === regionIdx ? base.current : i < regionIdx ? base.done : ''}
              >
                {r.name}
                {w !== undefined && w !== null && (
                  <span className={styles.mini} style={{ background: PLAYER_COLORS[w] }}>
                    {w + 1}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <span className={styles.kicker}>Итоги боя · раунд {report.round}</span>
        <h2 className={base.title}>{REGIONS[regionIdx]?.name}</h2>

        <ul className={styles.rows}>
          {rows.map((r) => (
            <li
              key={r.player}
              className={`${styles.row} ${r.player === winner ? styles.win : ''}`}
              style={{ borderColor: PLAYER_COLORS[r.player] }}
            >
              <span className={base.dot} style={{ background: PLAYER_COLORS[r.player] }}>
                {r.player + 1}
              </span>
              <span className={styles.name}>{who(r.player)}</span>
              <span className={styles.token}>
                {r.token ? (
                  <>
                    <img src={TOKEN_IMG[r.token]} alt="" />
                    {COMBAT_TOKENS[r.token].name}
                  </>
                ) : (
                  <i>без жетона</i>
                )}
              </span>
              <span className={styles.power}>
                {r.strength === null ? <i>отступил</i> : r.strength}
              </span>
              <span className={styles.crown}>{r.player === winner ? '♛' : ''}</span>
            </li>
          ))}
        </ul>

        <p className={styles.verdict}>
          {winner === null
            ? 'Ничья — победителя нет, награды нет'
            : `Победа: ${who(winner)} — +${gain} влияния${domination ? ' (с Доминацией)' : ''}, дальше награда на выбор`}
        </p>
        <button type="button" className={styles.go} onClick={onClose} autoFocus>
          Дальше ▸
        </button>
      </div>
    </div>
  );
}
