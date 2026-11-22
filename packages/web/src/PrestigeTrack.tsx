import type { Observation } from '@vampire/core';
import { PRESTIGE_TRACK } from '@vampire/data';
import { PLAYER_COLORS } from './Board';
import { Icon } from './Icon';
import { playerName } from './labels';
import styles from './PrestigeTrack.module.css';

/** Общий трек престижа 0…40 как на поле: отметки ПО — короной, фишки всех игроков. */
export function PrestigeTrack({ obs }: { obs: Observation }) {
  const cells = Array.from({ length: PRESTIGE_TRACK.max + 1 }, (_, n) => n);
  return (
    <div className={styles.track}>
      <span className={styles.label} title="Престиж: здания, Цитадель, персонажи в конце игры">
        <Icon name="prestige" size={22} />
      </span>
      <div className={styles.cells}>
        {cells.map((n) => {
          const mark = (PRESTIGE_TRACK.vpMarks as readonly number[]).includes(n);
          const here = obs.players.flatMap((p, i) => (p.prestige === n ? [i] : []));
          return (
            <div
              key={n}
              className={`${styles.cell} ${mark ? styles.mark : ''}`}
              title={mark ? `${n} престижа: +1 ПО` : `${n} престижа`}
            >
              <span className={styles.num}>{n}</span>
              {mark && <Icon name="vp" size={14} />}
              <span className={styles.players}>
                {here.map((i) => (
                  <span
                    key={i}
                    className={styles.dot}
                    style={{ background: PLAYER_COLORS[i] }}
                    title={`${playerName(i)}: ${n} престижа`}
                  />
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
