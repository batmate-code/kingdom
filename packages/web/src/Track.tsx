import type { Observation } from '@vampire/core';
import { TRACKS, type RegionId } from '@vampire/data';
import { PLAYER_COLORS } from './Board';
import { Icon } from './Icon';
import { playerName, regionName } from './labels';
import styles from './Track.module.css';

/**
 * Трек влияния региона как на поле: клетки сверху вниз от максимума к 0, на клетках — значки
 * событий (ПО, порог Цитадели, подорожание входа в Город, жетон первенства) и фишки игроков.
 */
export function Track({ obs, region }: { obs: Observation; region: RegionId }) {
  const track = TRACKS[region];
  const raised = obs.cityEntryRaisedRegions.includes(region);
  const first = obs.firstToMax[region];
  const cells = Array.from({ length: track.max + 1 }, (_, i) => track.max - i);

  return (
    <div className={styles.track} title={`Влияние: ${regionName(region)}`}>
      {cells.map((n) => {
        const here = obs.players.flatMap((p, i) => (p.influence[region] === n ? [i] : []));
        const isMax = n === track.max;
        return (
          <div key={n} className={`${styles.cell} ${isMax ? styles.top : ''}`}>
            <span className={styles.num}>{n}</span>
            <span className={styles.marks}>
              {track.vpMarks.includes(n) && (
                <span title="Отметка ПО">
                  <Icon name="vp" size={16} />
                </span>
              )}
              {isMax && (
                <span
                  className={styles.first}
                  style={first !== undefined ? { background: PLAYER_COLORS[first] } : {}}
                  title={
                    first !== undefined
                      ? `Жетон первенства: ${playerName(first)}`
                      : 'Жетон первенства: первому, кто дойдёт сюда (+1 ПО)'
                  }
                >
                  1
                  <Icon name="vp" size={12} />
                </span>
              )}
              {n === track.citadelAt && (
                <span title={`С ${n} влияния доступна Цитадель`}>
                  <Icon name="citadelOpen" size={16} />
                </span>
              )}
              {n === track.cityEntryRaiseAt && (
                <span
                  className={raised ? styles.done : ''}
                  title={
                    raised
                      ? 'Рубеж пройден: вход в Город уже подорожал'
                      : 'Первый, кто дойдёт сюда, поднимет цену входа в Город на 1'
                  }
                >
                  <Icon name="cityEntryRaise" size={16} />
                </span>
              )}
            </span>
            <span className={styles.players}>
              {here.map((i) => (
                <span
                  key={i}
                  className={styles.dot}
                  style={{ background: PLAYER_COLORS[i] }}
                  title={`${playerName(i)}: ${n}`}
                />
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
