import type { Action, Observation } from '@vampire/core';
import { CHARACTERS, PROFESSIONS } from '@vampire/data';
import { cardUrl } from './cards';
import { profStyle } from './colors';
import styles from './Draft.module.css';

type DraftAction = Extract<Action, { type: 'draftPick' }>;

/**
 * Выкладка драфта картами: персонажи — карты, профессии — цветные плашки.
 * Если сейчас выбирает человек — кликом берётся персонаж или профессия.
 */
export function Draft({
  obs,
  legal,
  onPick,
}: {
  obs: Observation;
  legal: Action[];
  onPick(a: Action): void;
}) {
  const picks = legal.filter((a): a is DraftAction => a.type === 'draftPick');
  const pickCharacter = (id: string) =>
    picks.find((a) => a.pick.kind === 'character' && a.pick.character === id);
  const pickProfession = (id: string) =>
    picks.find((a) => a.pick.kind === 'profession' && a.pick.profession === id);
  const { characters, professions } = obs.offer;
  if (characters.length + professions.length === 0) return null;

  return (
    <div className={styles.draft}>
      <div className={styles.title}>
        {obs.phase === 'draft' ? 'Драфт' : 'Пул Таверны'}
        {picks.length > 0 && <span className={styles.hint}> — кликните, чтобы взять</span>}
      </div>
      <div className={styles.cards}>
        {characters.map((id) => {
          const action = pickCharacter(id);
          const c = CHARACTERS[id];
          return (
            <button
              key={id}
              type="button"
              className={`${styles.card} ${action ? styles.pickable : ''}`}
              disabled={!action}
              onClick={() => action && onPick(action)}
              title={`${c.name}: ${c.text} (содержание ${c.upkeep})`}
            >
              <img src={cardUrl(id)} alt={c.name} />
              <span>
                {c.name} · {c.upkeep} кр
              </span>
            </button>
          );
        })}
      </div>
      <div className={styles.profs}>
        {professions.map((id, i) => {
          const action = pickProfession(id);
          return (
            <button
              key={`${id}${i}`}
              type="button"
              className={`${styles.prof} ${action ? styles.pickable : ''}`}
              style={profStyle(id)}
              disabled={!action}
              onClick={() => action && onPick(action)}
            >
              {PROFESSIONS[id].name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
