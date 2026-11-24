import { useRef } from 'react';
import { useTokenMotion } from './board/tokenMotion';
import type { Worker } from '@vampire/core';
import { CHARACTERS, PROFESSIONS } from '@vampire/data';
import { profColor } from './colors';
import { playerName } from './labels';
import { PLAYER_COLORS } from './players';
import styles from './Token.module.css';

/** Номер рабочего игрока на фишке (1–3). */
function workerNumber(w: Worker): number {
  return Number(w.id.split('w')[1] ?? 0) + 1;
}

function workerTitle(w: Worker): string {
  const who = playerName(w.owner);
  if (!w.character || !w.profession) return `${who}: рабочий без улучшения`;
  return `${who}: ${CHARACTERS[w.character].name} (${CHARACTERS[w.character].text}) / ${PROFESSIONS[w.profession].name}`;
}

/** Фишка рабочего: цвет игрока, кольцо — цвет профессии, буквы — персонаж. */
export function Token({
  w,
  selected,
  onClick,
}: {
  w: Worker;
  selected?: boolean;
  onClick?: () => void;
}) {
  const ring = w.profession ? profColor(w.profession) : '#2a2430';
  // Движение фишки с прежнего места (автор 24.11).
  const ref = useRef<HTMLButtonElement>(null);
  useTokenMotion(ref, w);
  return (
    <button
      ref={ref}
      type="button"
      className={`${styles.token} ${selected ? styles.tokenSelected : ''} ${onClick ? styles.clickable : ''}`}
      style={{ background: PLAYER_COLORS[w.owner], boxShadow: `0 0 0 3px ${ring}` }}
      title={workerTitle(w)}
      onClick={onClick}
      disabled={!onClick}
    >
      {workerNumber(w)}
    </button>
  );
}
