import {
  actionLabel,
  applyAction,
  decisionTitle,
  regionName,
  type Action,
  type Decision,
  type GameEvent,
  type GameState,
  type PlayerId,
} from '@vampire/core';
import type { RegionId, Resources } from '@vampire/data';
import { useEffect, useMemo } from 'react';
import styles from './ActionBar.module.css';
import { Icon, RichText, type IconName } from './Icon';

/** Решения, где примерка хода раскрыла бы скрытое (жетоны боя соперников). */
const HIDDEN: ReadonlySet<Decision['kind']> = new Set(['combatToken', 'retreat', 'spyMove']);

/** События, после которых ход уже закончился (конец раунда, вскрытие жетонов). */
const STOP: ReadonlySet<GameEvent['type']> = new Set([
  'roundStarted',
  'combatTokensRevealed',
  'workerReturned',
]);

const RES: readonly (keyof Resources)[] = ['gold', 'blood', 'ore', 'compromat'];

export interface Effect {
  resources: Partial<Resources>;
  influence: Partial<Record<RegionId, number>>;
  prestige: number;
}

/** Что ход даст игроку сразу: ресурсы, влияние, престиж (примерка на копии партии). */
export function previewEffect(state: GameState, action: Action, player: PlayerId): Effect | null {
  if (state.pending && HIDDEN.has(state.pending.kind)) return null;
  let events: GameEvent[];
  try {
    events = applyAction(state, action).events;
  } catch {
    return null;
  }
  const effect: Effect = { resources: {}, influence: {}, prestige: 0 };
  for (const e of events) {
    if (STOP.has(e.type)) break;
    if (!('player' in e) || e.player !== player) continue;
    if (e.type === 'resourcesChanged') {
      for (const r of RES) {
        const v = e.delta[r];
        if (v) effect.resources[r] = (effect.resources[r] ?? 0) + v;
      }
    } else if (e.type === 'influenceChanged') {
      effect.influence[e.region] = (effect.influence[e.region] ?? 0) + e.to - e.from;
    } else if (e.type === 'prestigeChanged') {
      effect.prestige += e.to - e.from;
    }
  }
  return effect;
}

/** Предпросмотр хода одной строкой — для подсказок на поле. */
export function effectText(effect: Effect | null): string {
  if (!effect) return '';
  const names: Record<keyof Resources, string> = {
    gold: 'зол',
    blood: 'кр',
    ore: 'руд',
    compromat: 'комп',
  };
  const parts: string[] = [];
  for (const r of RES) {
    const n = effect.resources[r];
    if (n) parts.push(`${signed(n)} ${names[r]}`);
  }
  for (const [region, n] of Object.entries(effect.influence) as [RegionId, number][]) {
    if (n) parts.push(`${signed(n)} влияния (${regionName(region)})`);
  }
  if (effect.prestige) parts.push(`${signed(effect.prestige)} престижа`);
  return parts.join(', ');
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

export function EffectLine({ effect }: { effect: Effect }) {
  const parts: { key: string; n: number; icon: IconName; note?: string }[] = [];
  for (const r of RES) {
    const n = effect.resources[r];
    if (n) parts.push({ key: r, n, icon: r });
  }
  for (const [region, n] of Object.entries(effect.influence) as [RegionId, number][]) {
    if (n) parts.push({ key: region, n, icon: 'influence', note: regionName(region) });
  }
  if (effect.prestige) parts.push({ key: 'prestige', n: effect.prestige, icon: 'prestige' });
  if (parts.length === 0) return null;
  return (
    <div className={styles.effect}>
      {parts.map((p) => (
        <span key={p.key} className={p.n > 0 ? styles.gain : styles.loss}>
          {signed(p.n)} <Icon name={p.icon} size={20} />
          {p.note && <span className={styles.note}>{p.note}</span>}
        </span>
      ))}
    </div>
  );
}

/** Отказ от действия — второстепенная кнопка. */
function isDecline(label: string): boolean {
  return /^(Пропустить|Не |Пас|Отказаться)/.test(label);
}

interface Props {
  state: GameState;
  /** Ходы человека, которые выбираются в панели (без размещения и драфта — они на поле). */
  legal: Action[];
  botTurn: boolean;
  hint: string | null;
  error: string | null;
  onAct: (a: Action) => void;
  /** Выбор среди вариантов цели на поле: кнопка «Отмена» возвращает обычные ходы. */
  onCancel?: (() => void) | undefined;
}

/** Панель решений внизу экрана: заголовок, подсказка и крупные карточки ходов. */
export function ActionBar({ state, legal, botTurn, hint, error, onAct, onCancel }: Props) {
  const player = state.pending?.player ?? 0;
  const cards = useMemo(
    () =>
      legal.map((a) => {
        const label = actionLabel(state, a);
        return {
          action: a,
          label,
          decline: isDecline(label),
          effect: previewEffect(state, a, player),
        };
      }),
    [state, legal, player],
  );
  const main = cards.filter((c) => !c.decline);
  const declines = cards.filter((c) => c.decline);

  // Клавиши 1–9 — выбор карточки, 0 — отказ.
  useEffect(() => {
    if (botTurn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || e.key === ' ') return;
      const card = n === 0 ? declines[0] : main[n - 1];
      if (card) {
        e.preventDefault();
        onAct(card.action);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [botTurn, main, declines, onAct]);

  return (
    <section className={`${styles.bar} ${botTurn ? styles.waiting : ''}`}>
      <div className={styles.head}>
        <h2 className={styles.title}>{decisionTitle(state)}</h2>
        {botTurn && <span className={styles.hint}>Ходит бот…</span>}
        {!botTurn && hint && <span className={styles.hint}>{hint}</span>}
        {error && <span className={styles.error}>{error}</span>}
      </div>
      {!botTurn && cards.length > 0 && (
        <div className={styles.cards}>
          {main.map((c, i) => (
            <button key={i} className={styles.card} onClick={() => onAct(c.action)}>
              <span className={styles.label}>
                <RichText text={c.label} />
              </span>
              {c.effect && <EffectLine effect={c.effect} />}
            </button>
          ))}
          {onCancel && (
            <button className={`${styles.card} ${styles.decline}`} onClick={onCancel}>
              <span className={styles.label}>Отмена</span>
            </button>
          )}
          {declines.map((c, i) => (
            <button
              key={`d${i}`}
              className={`${styles.card} ${styles.decline}`}
              onClick={() => onAct(c.action)}
            >
              <span className={styles.label}>
                <RichText text={c.label} />
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
