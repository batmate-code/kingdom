import type { Action, GameState, Observation, Worker } from '@vampire/core';
import { CHARACTERS, PROFESSIONS } from '@vampire/data';
import { useEffect, useState } from 'react';
import { profStyle } from './colors';
import { EffectLine, previewEffect } from './ActionBar';
import { cardUrl } from './cards';
import { Draft } from './Draft';
import styles from './DraftModal.module.css';
import { playerName } from './labels';

/**
 * Драфт большим окном поверх поля (решение автора 23.11): карты крупно, можно скрыть окно и
 * посмотреть на поле; кнопка «Показать драфт» возвращает его. В новом раунде окно открывается само.
 * После драфта в окне — улучшение: своя пара крупно и варианты (назначить рабочему / сбросить);
 * строка решения внизу дублирует их для клавиш.
 */
export function DraftModal({
  obs,
  legal,
  onPick,
  viewer,
  pendingPlayer,
  state,
}: {
  state: GameState;
  obs: Observation;
  legal: Action[];
  onPick(a: Action): void;
  viewer: number;
  pendingPlayer: number | null;
}) {
  const [hidden, setHidden] = useState(false);
  // Новый раунд — окно снова открыто.
  useEffect(() => setHidden(false), [obs.round]);

  const myPick = legal.some((a) => a.type === 'draftPick');
  const upgrades = legal.filter(
    (a): a is Extract<Action, { type: 'upgrade' }> => a.type === 'upgrade',
  );
  const myUpgrade = upgrades.length > 0;
  const pick = obs.players[viewer]?.draftPick;
  const status = myUpgrade
    ? 'Улучшение: назначьте пару рабочему или сбросьте её за отступные'
    : obs.phase === 'upgrade' && pendingPlayer !== null
      ? `Улучшение: решает ${playerName(pendingPlayer)}…`
      : myPick
        ? 'Ваш выбор: возьмите персонажа или профессию'
        : pendingPlayer !== null
          ? `Выбирает ${playerName(pendingPlayer)}…`
          : '';

  if (hidden) {
    return (
      <button
        type="button"
        className={`${styles.show} ${myPick || myUpgrade ? styles.pulse : ''}`}
        onClick={() => setHidden(false)}
      >
        ▴ Показать драфт{myPick || myUpgrade ? ' — ваш выбор' : ''}
      </button>
    );
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog} role="dialog" aria-label="Драфт">
        <header className={styles.head}>
          <h2 className={styles.title}>Драфт · раунд {obs.round}</h2>
          <span className={`${styles.status} ${myPick || myUpgrade ? styles.mine : ''}`}>
            {status}
          </span>
          <button type="button" className={styles.hide} onClick={() => setHidden(true)}>
            Скрыть — посмотреть поле ▾
          </button>
        </header>
        {myUpgrade && pick ? (
          <UpgradeBlock
            state={state}
            obs={obs}
            viewer={viewer}
            upgrades={upgrades}
            onPick={onPick}
          />
        ) : (
          <div className={styles.body}>
            <Draft obs={obs} legal={legal} onPick={onPick} />
          </div>
        )}
        {!myUpgrade && pick && (pick.character || pick.profession) && (
          <footer className={styles.mine}>
            Ваша пара: <b>{pick.character ? CHARACTERS[pick.character].name : '— персонаж —'}</b>
            {' + '}
            {pick.profession ? (
              <span className={styles.prof} style={profStyle(pick.profession)}>
                {PROFESSIONS[pick.profession].name}
              </span>
            ) : (
              <b>— профессия —</b>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}

/** Ключ «одинаковых» рабочих: ядро предлагает назначение только одному из них. */
const pairKey = (w: Worker) => `${w.profession ?? '-'}|${w.character ?? '-'}`;

/**
 * Улучшение схемой «пара → куда ставим»: своя пара (карта с лентой профессии), стрелка, три слота
 * рабочих одного размера (как на планшете); под ними — сброс за отступные.
 */
function UpgradeBlock({
  state,
  obs,
  viewer,
  upgrades,
  onPick,
}: {
  state: GameState;
  obs: Observation;
  viewer: number;
  upgrades: Extract<Action, { type: 'upgrade' }>[];
  onPick(a: Action): void;
}) {
  const pick = obs.players[viewer]?.draftPick;
  if (!pick?.character || !pick.profession) return null;
  const ch = CHARACTERS[pick.character];
  const prof = PROFESSIONS[pick.profession];
  const own = obs.workers
    .filter((w) => w.owner === viewer)
    .sort((x, y) => x.id.localeCompare(y.id));
  const assignFor = (w: Worker) =>
    upgrades.find((a) => {
      if (a.choice.kind !== 'assign') return false;
      const id = a.choice.workerId;
      const target = obs.workers.find((x) => x.id === id);
      return target !== undefined && pairKey(target) === pairKey(w);
    });
  const discard = upgrades.find((a) => a.choice.kind === 'discard');
  const discardEffect = discard ? previewEffect(state, discard, viewer) : null;

  return (
    <div className={styles.upgrade}>
      <div className={styles.flow}>
        <figure className={styles.pair}>
          <img className={styles.card} src={cardUrl(pick.character)} alt={ch.name} />
          <figcaption className={styles.ribbon} style={profStyle(pick.profession)}>
            <b>{prof.name}</b>
            <span>{prof.text}</span>
          </figcaption>
        </figure>
        <span className={styles.flowArrow}>→</span>
        <div className={styles.slots}>
          {own.map((w, i) => {
            const a = assignFor(w);
            const effect = a ? previewEffect(state, a, viewer) : null;
            const old = w.character ? CHARACTERS[w.character].name : null;
            const src = cardUrl(w.character ?? '_back');
            return (
              <button
                key={w.id}
                type="button"
                className={styles.slot}
                disabled={!a}
                onClick={() => a && onPick(a)}
                title={
                  old ? `Заменит ${old}: старая пара уйдёт за отступные` : 'Рабочий без улучшения'
                }
              >
                {src && <img className={styles.card} src={src} alt="" />}
                <span className={styles.slotNum}>Рабочий {i + 1}</span>
                <span className={styles.slotNote}>{old ? `заменит: ${old}` : 'без улучшения'}</span>
                {effect && <EffectLine effect={effect} />}
              </button>
            );
          })}
        </div>
      </div>
      {discard && (
        <button type="button" className={styles.discard} onClick={() => onPick(discard)}>
          Сбросить пару за отступные
          {discardEffect && <EffectLine effect={discardEffect} />}
        </button>
      )}
    </div>
  );
}
