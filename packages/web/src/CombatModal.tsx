import { type Action, type GameState, type Observation } from '@vampire/core';
import { COMBAT_TOKENS, COMBAT_TOKEN_ORDER, REGIONS, type CombatTokenId } from '@vampire/data';
import { useEffect, useState } from 'react';
import attackImg from './assets/tokens/attack.png';
import decoyImg from './assets/tokens/decoy.png';
import defenseImg from './assets/tokens/defense.png';
import dominationImg from './assets/tokens/domination.png';
import massacreImg from './assets/tokens/massacre.png';
import retreatImg from './assets/tokens/retreat.png';
import { PLAYER_COLORS } from './Board';
import type { BoardStrengths } from './board/BoardSvg';
import styles from './CombatModal.module.css';
import { playerName } from './labels';

/** Иконки жетонов боя — вырезаны из docs/images/combat-tokens.jpg. */
export const TOKEN_IMG: Record<CombatTokenId, string> = {
  retreat: retreatImg,
  attack: attackImg,
  massacre: massacreImg,
  domination: dominationImg,
  decoy: decoyImg,
  defense: defenseImg,
};

/**
 * Выбор жетона боя отдельным окном поверх поля (решение автора 23.11): у каждого жетона иконка,
 * сила и эффект, сверху — какой регион, порядок боёв и силы участников. Окно можно скрыть,
 * чтобы посмотреть на поле.
 */
export function CombatModal({
  state,
  obs,
  legal,
  strengths,
  viewer,
  onPick,
}: {
  state: GameState;
  obs: Observation;
  legal: Action[];
  strengths: BoardStrengths | undefined;
  viewer: number;
  onPick(a: Action): void;
}) {
  const pending = state.pending;
  const region = pending?.kind === 'combatToken' ? pending.region : null;
  const [hidden, setHidden] = useState(false);
  // Новый бой — окно снова открыто.
  useEffect(() => setHidden(false), [region, obs.round]);

  const options = legal.filter(
    (a): a is Extract<Action, { type: 'combatToken' }> => a.type === 'combatToken',
  );
  if (region === null || options.length === 0) return null;

  if (hidden) {
    return (
      <button type="button" className={styles.show} onClick={() => setHidden(false)}>
        ▴ Выбрать жетон боя — {REGIONS.find((r) => r.id === region)?.name}
      </button>
    );
  }

  const me = obs.players[viewer];
  const regionIdx = REGIONS.findIndex((r) => r.id === region);
  const played = new Set(obs.combat?.plays.map((p) => p.player) ?? []);
  const sides = strengths?.[region] ?? [];

  return (
    <div className={styles.backdrop}>
      <div className={`${styles.dialog} ${styles[region]}`} role="dialog" aria-label="Жетон боя">
        <header className={styles.head}>
          <ol className={styles.steps}>
            {REGIONS.map((r, i) => (
              <li
                key={r.id}
                className={i === regionIdx ? styles.current : i < regionIdx ? styles.done : ''}
              >
                {r.name}
              </li>
            ))}
          </ol>
          <h2 className={styles.title}>Бой · {REGIONS[regionIdx]?.name}</h2>
          <button type="button" className={styles.hide} onClick={() => setHidden(true)}>
            Скрыть — посмотреть поле ▾
          </button>
        </header>

        <div className={styles.sides}>
          {sides.map((s) => (
            <div
              key={s.player}
              className={`${styles.side} ${s.player === viewer ? styles.me : ''}`}
              style={{ borderColor: PLAYER_COLORS[s.player] }}
            >
              <span className={styles.dot} style={{ background: PLAYER_COLORS[s.player] }}>
                {s.player + 1}
              </span>
              <span className={styles.sideName}>
                {s.player === viewer ? 'Вы' : playerName(s.player)}
              </span>
              <span className={styles.power} title="Сила без жетона боя">
                {s.strength}
              </span>
              <span className={styles.state}>
                {s.player === viewer
                  ? 'выбираете'
                  : played.has(s.player)
                    ? 'жетон положен'
                    : 'ещё не выбрал'}
              </span>
            </div>
          ))}
        </div>

        <p className={styles.note}>
          Жетон кладётся в закрытую, все вскрываются одновременно. Сыгранный уходит в сброс до конца
          3-го раунда.
        </p>

        <div className={styles.grid}>
          {COMBAT_TOKEN_ORDER.map((t) => {
            const def = COMBAT_TOKENS[t];
            const inHand = me?.combatTokens.hand[t] ?? 0;
            const action = options.find((a) => a.token === t);
            return (
              <button
                key={t}
                type="button"
                className={styles.token}
                disabled={!action}
                onClick={() => action && onPick(action)}
              >
                <span className={styles.count}>
                  {inHand === 0 ? 'в сбросе' : action ? `×${inHand}` : 'нет соперников'}
                </span>
                <img className={styles.icon} src={TOKEN_IMG[t]} alt="" />
                <span className={styles.name}>{def.name}</span>
                {def.strength > 0 && <span className={styles.plus}>+{def.strength}</span>}
                <span className={styles.text}>{def.text}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
