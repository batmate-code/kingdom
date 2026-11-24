import type { Action, Observation } from '@vampire/core';
import {
  CHARACTERS,
  CHARACTER_ORDER,
  PROFESSIONS,
  PROFESSION_ORDER,
  type CharacterId,
  type ProfessionId,
} from '@vampire/data';
import { CharacterCard } from './CharacterCard';
import { profStyle } from './colors';
import styles from './Draft.module.css';
import { playerName } from './labels';

type DraftAction = Extract<Action, { type: 'draftPick' }>;

interface Slot<T> {
  id: T;
  /** Кто взял карту на драфте (null — ещё в пуле). */
  takenBy: number | null;
}

/**
 * Выкладка драфта одним рядом карт: персонажи — картинки карт, профессии — карты, залитые
 * цветом профессии. До конца драфта взятые карты остаются на месте чёрно-белыми с именем
 * взявшего. Если выбирает человек — кликом берётся карта.
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
  const drafting = obs.phase === 'draft' || obs.phase === 'upgrade';

  // Выкладка раунда = что осталось в пуле + что уже взяли игроки (пока идёт драфт).
  const chars: Slot<CharacterId>[] = obs.offer.characters.map((id) => ({ id, takenBy: null }));
  const profs: Slot<ProfessionId>[] = obs.offer.professions.map((id) => ({ id, takenBy: null }));
  if (drafting) {
    obs.players.forEach((p, i) => {
      if (p.draftPick.character) chars.push({ id: p.draftPick.character, takenBy: i });
      if (p.draftPick.profession) profs.push({ id: p.draftPick.profession, takenBy: i });
    });
  }
  // Постоянный порядок, чтобы карты не прыгали, когда их берут.
  chars.sort((a, b) => CHARACTER_ORDER.indexOf(a.id) - CHARACTER_ORDER.indexOf(b.id));
  profs.sort((a, b) => PROFESSION_ORDER.indexOf(a.id) - PROFESSION_ORDER.indexOf(b.id));
  if (chars.length + profs.length === 0) return null;

  const pickCharacter = (id: string) =>
    picks.find((a) => a.pick.kind === 'character' && a.pick.character === id);
  const pickProfession = (id: string) =>
    picks.find((a) => a.pick.kind === 'profession' && a.pick.profession === id);

  const characterCards = chars.map(({ id, takenBy }, i) => {
    const action = takenBy === null ? pickCharacter(id) : undefined;
    const c = CHARACTERS[id];
    return (
      <button
        key={`${id}${i}`}
        type="button"
        className={`${styles.card} ${action ? styles.pickable : ''} ${takenBy !== null ? styles.taken : ''}`}
        disabled={!action}
        onClick={() => action && onPick(action)}
        title={`${c.name}: ${c.text} (содержание ${c.upkeep})${takenBy !== null ? ` — взял ${playerName(takenBy)}` : ''}`}
      >
        <CharacterCard id={id} size="lg" />
        {takenBy !== null && <span className={styles.takenBy}>{playerName(takenBy)}</span>}
      </button>
    );
  });
  const professionCards = profs.map(({ id, takenBy }, i) => {
    const action = takenBy === null ? pickProfession(id) : undefined;
    return (
      <button
        key={`${id}${i}`}
        type="button"
        className={`${styles.card} ${styles.profCard} ${action ? styles.pickable : ''} ${takenBy !== null ? styles.taken : ''}`}
        style={profStyle(id)}
        disabled={!action}
        onClick={() => action && onPick(action)}
        title={`${PROFESSIONS[id].name}: ${PROFESSIONS[id].text}${takenBy !== null ? ` — взял ${playerName(takenBy)}` : ''}`}
      >
        {PROFESSIONS[id].name}
        {takenBy !== null && <span className={styles.takenBy}>{playerName(takenBy)}</span>}
      </button>
    );
  });

  // После драфта — пул Таверны: свёрнут, карты подряд.
  if (!drafting) {
    return (
      <details className={styles.draft}>
        <summary className={styles.title}>Пул Таверны ({chars.length + profs.length})</summary>
        <div className={styles.compact}>
          {characterCards}
          {professionCards}
        </div>
      </details>
    );
  }

  return (
    <div className={styles.draft}>
      <div className={styles.title}>
        Драфт
        {picks.length > 0 && <span className={styles.hint}> — кликните, чтобы взять</span>}
      </div>
      <div className={styles.row}>
        <div className={styles.group}>{characterCards}</div>
        <div className={styles.group}>{professionCards}</div>
      </div>
    </div>
  );
}
