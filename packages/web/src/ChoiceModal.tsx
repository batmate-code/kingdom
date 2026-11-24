import { decisionTitle, type Action, type GameState, type PlayerId } from '@vampire/core';
import { useEffect, useState } from 'react';
import { EffectLine, previewEffect } from './ActionBar';
import styles from './ChoiceModal.module.css';
import { DONE, stepOptions } from './choiceSteps';
import { RichText } from './Icon';

/**
 * Окно выбора (автор 24.11): все выборы, которые предлагает игра, — кнопками в окне над полем;
 * вложенный выбор — по шагам (Канцелярия: первое действие, затем второе или «Готово»).
 */
export function ChoiceModal({
  state,
  actions,
  viewer,
  onPick,
  onCancel,
}: {
  state: GameState;
  actions: readonly Action[];
  viewer: PlayerId;
  onPick(a: Action): void;
  onCancel?: (() => void) | undefined;
}) {
  const [path, setPath] = useState<string[]>([]);
  // Новое решение — с первого шага.
  useEffect(() => setPath([]), [actions]);
  const options = stepOptions(state, actions, path);
  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog} role="dialog" aria-label="Выбор">
        <h2 className={styles.title}>{decisionTitle(state)}</h2>
        {path.length > 0 && (
          <div className={styles.path}>
            <RichText text={path.join(' · ')} />
          </div>
        )}
        <div className={styles.options}>
          {options.map((o) => {
            const effect = o.action ? previewEffect(state, o.action, viewer) : null;
            return (
              <button
                key={o.label}
                type="button"
                className={`${styles.option} ${o.label === DONE ? styles.done : ''}`}
                onClick={() => (o.action ? onPick(o.action) : setPath([...path, o.label]))}
              >
                <span className={styles.label}>
                  <RichText text={o.label} />
                  {!o.action && ' →'}
                </span>
                {effect && <EffectLine effect={effect} />}
              </button>
            );
          })}
        </div>
        <div className={styles.footer}>
          {path.length > 0 && (
            <button type="button" onClick={() => setPath(path.slice(0, -1))}>
              ← Назад
            </button>
          )}
          {onCancel && (
            <button type="button" onClick={onCancel}>
              Отмена
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
