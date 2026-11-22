import type { Phase } from '@vampire/core';
import { useEffect, useRef, useState } from 'react';
import { PLAYER_COLORS } from './Board';
import styles from './TurnToast.module.css';

const PHASE_LABEL: Partial<Record<Phase, string>> = {
  placement: 'Размещение',
  combat: 'Бой',
};

/** Сколько держится тост, мс (совпадает с анимацией в CSS). */
const SHOW_MS = 2000;

/**
 * Тост смены хода (решение автора 23.11): выезжает сверху над полем, не блокирует интерфейс,
 * сам исчезает. Только в фазах размещения и боёв; новый ход заменяет прошлый тост.
 */
export function TurnToast({
  player,
  phase,
  human,
}: {
  /** Кто сейчас ходит (null — никто). */
  player: number | null;
  phase: Phase;
  /** Ходит человек за этим компьютером. */
  human: boolean;
}) {
  const [toast, setToast] = useState<{
    id: number;
    player: number;
    phase: Phase;
    human: boolean;
  } | null>(null);
  const last = useRef<string>('');
  const seq = useRef(0);

  useEffect(() => {
    if (player === null || !PHASE_LABEL[phase]) {
      last.current = '';
      return;
    }
    const key = `${phase}:${player}`;
    if (key === last.current) return;
    last.current = key;
    seq.current += 1;
    setToast({ id: seq.current, player, phase, human });
  }, [player, phase, human]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;
  const color = PLAYER_COLORS[toast.player];
  return (
    <div
      key={toast.id}
      className={`${styles.toast} ${toast.human ? styles.mine : styles.other}`}
      style={{ borderColor: color, ['--player' as string]: color }}
      role="status"
      aria-live="polite"
    >
      <span className={styles.dot} style={{ background: color }}>
        {toast.player + 1}
      </span>
      <span className={styles.text}>
        <span className={styles.phase}>{PHASE_LABEL[toast.phase]}</span>
        {toast.human ? (
          <b>Игрок {toast.player + 1} — ваш ход</b>
        ) : (
          <span>Ходит Игрок {toast.player + 1}</span>
        )}
      </span>
    </div>
  );
}
