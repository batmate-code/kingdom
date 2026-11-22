import { getScores, type GameState, type Observation, type Worker } from '@vampire/core';
import {
  BUILDINGS,
  CHARACTERS,
  COMBAT_TOKENS,
  COMBAT_TOKEN_ORDER,
  GAME,
  PROFESSIONS,
  REGION_ORDER,
  TRACKS,
  type BuildingId,
} from '@vampire/data';
import { useState } from 'react';
import { PLAYER_COLORS } from './Board';
import { locName, playerName, regionName } from './labels';
import { cardUrl } from './cards';
import { profStyle } from './colors';
import { Icon, RichText } from './Icon';
import styles from './PlayerBoard.module.css';

const BUILDING_ROWS: BuildingId[] = ['crypt', 'abbey', 'shop'];
const RES_LABEL = { gold: 'Золото', blood: 'Кровь', ore: 'Руда', compromat: 'Компромат' } as const;

function costText(type: BuildingId): string {
  const c = BUILDINGS[type].cost;
  return [c.gold ? `${c.gold} зол` : '', c.ore ? `${c.ore} руд` : ''].filter(Boolean).join(' + ');
}

function where(w: Worker): string {
  const p = w.position;
  if (p.kind === 'reserve') return 'в запасе';
  if (p.kind === 'hospital') return 'в госпитале';
  if (p.kind === 'citadelSpot') return `у звезды: ${regionName(p.region)}`;
  return `${locName(p.location)}, слот ${p.slot}`;
}

function WorkerCard({ w }: { w: Worker }) {
  const src = cardUrl(w.character ?? '_back');
  const title = w.character
    ? `${CHARACTERS[w.character].name}: ${CHARACTERS[w.character].text} (содержание ${CHARACTERS[w.character].upkeep})`
    : 'Рабочий без улучшения';
  return (
    <div className={styles.worker} title={title}>
      {src ? (
        <img className={styles.card} src={src} alt={title} />
      ) : (
        <div className={styles.card} />
      )}
      <div className={styles.workerInfo}>
        <b>{w.character ? CHARACTERS[w.character].name : 'Без улучшения'}</b>
        {w.profession && (
          <span className={styles.prof} style={profStyle(w.profession)}>
            {PROFESSIONS[w.profession].name}
          </span>
        )}
        <span className={styles.muted}>{where(w)}</span>
      </div>
    </div>
  );
}

/** Планшет игрока: ресурсы и треки, здания (построенные и нет), рабочие с картами. */
export function PlayerBoard({
  obs,
  state,
  defaultPlayer,
}: {
  obs: Observation;
  state: GameState;
  defaultPlayer: number;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const player = picked ?? defaultPlayer;
  const p = obs.players[player];
  if (!p) return null;
  const score = getScores(state).find((s) => s.player === player);
  const own = obs.workers.filter((w) => w.owner === player);
  const built = (type: BuildingId) =>
    obs.buildings.filter((b) => b.owner === player && b.type === type);
  const citadel = built('citadel')[0];

  return (
    <section className={styles.board} style={{ borderTopColor: PLAYER_COLORS[player] }}>
      <div className={styles.tabs}>
        {obs.players.map((_, i) => (
          <button
            key={i}
            className={i === player ? styles.tabActive : ''}
            style={{ borderColor: PLAYER_COLORS[i] }}
            onClick={() => setPicked(i === defaultPlayer ? null : i)}
          >
            {playerName(i)}
            {i === defaultPlayer ? ' (вы)' : ''}
          </button>
        ))}
      </div>

      <div className={styles.columns}>
        <div className={styles.stats}>
          <div className={styles.vp}>
            {score?.vp ?? 0} <Icon name="vp" size={22} />{' '}
            <span className={styles.prestige}>
              {p.prestige} <Icon name="prestige" size={20} />
            </span>
          </div>
          <div className={styles.resources}>
            {(Object.keys(RES_LABEL) as (keyof typeof RES_LABEL)[]).map((r) => (
              <div key={r} className={`${styles.res} ${styles[r]}`}>
                <b>{p.resources[r]}</b>
                <Icon name={r} size={22} />
              </div>
            ))}
          </div>
          {REGION_ORDER.map((r) => (
            <div
              key={r}
              className={styles.track}
              title={`Отметки ПО: ${TRACKS[r].vpMarks.join(', ')}`}
            >
              <span className={styles.trackName}>
                <Icon name="influence" size={14} /> {regionName(r)}
              </span>
              {Array.from({ length: TRACKS[r].max }, (_, i) => i + 1).map((n) => (
                <span
                  key={n}
                  className={`${styles.pip} ${n <= p.influence[r] ? styles.pipOn : ''} ${TRACKS[r].vpMarks.includes(n) ? styles.pipMark : ''}`}
                  style={n <= p.influence[r] ? { background: PLAYER_COLORS[player] } : {}}
                  title={n === TRACKS[r].citadelAt ? `С ${n} влияния доступна Цитадель` : undefined}
                >
                  {n === TRACKS[r].citadelAt && <Icon name="citadel" size={12} />}
                </span>
              ))}
              <span className={styles.muted}>{p.influence[r]}</span>
            </div>
          ))}
          <div className={styles.muted}>
            Жетоны боя:{' '}
            {COMBAT_TOKEN_ORDER.filter((t) => p.combatTokens.hand[t] > 0)
              .map(
                (t) =>
                  `${COMBAT_TOKENS[t].name}${p.combatTokens.hand[t] > 1 ? ` ×${p.combatTokens.hand[t]}` : ''}`,
              )
              .join(', ') || 'нет'}
          </div>
        </div>

        <div className={styles.buildings}>
          {BUILDING_ROWS.map((type) => {
            const count = built(type).length;
            return (
              <div key={type} className={styles.buildingRow}>
                <div className={styles.buildingName}>
                  <b>{BUILDINGS[type].name}</b>
                  <span className={styles.muted}>
                    <RichText text={costText(type)} />
                  </span>
                </div>
                {BUILDINGS[type].prestige.map((pr, i) => (
                  <span
                    key={i}
                    className={`${styles.hex} ${i < count ? styles.hexBuilt : ''}`}
                    style={i < count ? { background: PLAYER_COLORS[player] } : {}}
                    title={
                      i < count ? 'Построено' : `${i + 1}-е здание этого типа: +${pr} престижа`
                    }
                  >
                    {pr}
                    <Icon name="prestige" size={16} />
                  </span>
                ))}
              </div>
            );
          })}
          <div className={styles.buildingRow}>
            <div className={styles.buildingName}>
              <b>
                <Icon name="citadel" size={16} /> Цитадель
              </b>
              <span className={styles.muted}>
                <RichText text={costText('citadel')} />
              </span>
            </div>
            <span
              className={`${styles.hex} ${citadel ? styles.hexBuilt : ''}`}
              style={citadel ? { background: PLAYER_COLORS[player] } : {}}
              title={
                citadel ? `Построена: ${regionName(citadel.region)}` : '+10 престижа при постройке'
              }
            >
              {BUILDINGS.citadel.prestige[0]}
              <Icon name="prestige" size={16} />
            </span>
            {citadel && <span className={styles.muted}>{regionName(citadel.region)}</span>}
          </div>
        </div>

        <div className={styles.workers}>
          {own.map((w) => (
            <WorkerCard key={w.id} w={w} />
          ))}
          {Array.from({ length: Math.max(0, GAME.workersPerPlayer - own.length) }, (_, i) => (
            <div key={i} className={styles.worker} />
          ))}
          {(p.draftPick.character || p.draftPick.profession) && (
            <div className={styles.worker} title="Взято на драфте, ещё не назначено">
              {p.draftPick.character && (
                <img className={styles.card} src={cardUrl(p.draftPick.character)} alt="" />
              )}
              <div className={styles.workerInfo}>
                <b>Драфт: {p.draftPick.character ? CHARACTERS[p.draftPick.character].name : '—'}</b>
                {p.draftPick.profession && (
                  <span className={styles.prof} style={profStyle(p.draftPick.profession)}>
                    {PROFESSIONS[p.draftPick.profession].name}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
