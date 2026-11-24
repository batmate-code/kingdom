import { useLayoutEffect, useState, type RefObject } from 'react';
import { create } from 'zustand';
import type { Worker } from '@vampire/core';
import { profColor } from '../colors';
import { PLAYER_COLORS } from '../players';

/**
 * Движение фишек рабочих по полю (автор 24.11): из запаса в слот, Шпион между слотами,
 * вытесненный — в госпиталь. Когда фишка появляется на новом месте, по экрану 0,5 с едет её
 * «призрак» с прежнего места, затем 0,5 с пауза; пока идёт движение и пауза, боты и окна выбора
 * ждут (useMotionBusy). Работает и для HTML-фишек в слотах, и для SVG-фишек (госпиталь, звезда).
 */
export const MOVE_MS = 500;
export const PAUSE_MS = 500;

/** Когда призрак фишки доедет — по id рабочего. */
const flying = new Map<string, number>();

/** Последнее место фишки на экране — по id рабочего. */
const lastRect = new Map<string, DOMRect>();

export const useMotion = create<{ busyUntil: number }>(() => ({ busyUntil: 0 }));

function markBusy(): void {
  const until = Date.now() + MOVE_MS + PAUSE_MS;
  if (until > useMotion.getState().busyUntil) useMotion.setState({ busyUntil: until });
}

/** Рабочие вернулись в запас: следующее появление на поле — выход из запаса. */
export function forgetWorkers(ids: readonly string[]): void {
  for (const id of ids) lastRect.delete(id);
}

/** Первый показ поля (загрузка партии) — без анимации. */
let seeded = false;
export function markSeeded(): void {
  seeded = true;
}

/** Откуда выходят фишки из запаса: правый край поля, посередине (там панель игрока). */
function reserveRect(size: number): DOMRect | null {
  const board = document.querySelector('[data-board]');
  if (!board) return null;
  const b = board.getBoundingClientRect();
  return new DOMRect(b.right - size, b.top + b.height / 2 - size / 2, size, size);
}

/** Призрак фишки: кружок цвета игрока с кольцом профессии и номером рабочего. */
function ghost(w: Worker, from: DOMRect, to: DOMRect): void {
  const el = document.createElement('div');
  const size = to.width;
  Object.assign(el.style, {
    position: 'fixed',
    left: `${from.left + from.width / 2 - size / 2}px`,
    top: `${from.top + from.height / 2 - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    background: PLAYER_COLORS[w.owner] ?? '#999',
    boxShadow: `0 0 0 ${Math.max(2, size / 10)}px ${w.profession ? profColor(w.profession) : '#2a2430'}, 0 4px 14px rgba(0,0,0,.7)`,
    zIndex: '1000',
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    font: `800 ${Math.round(size * 0.5)}px system-ui, sans-serif`,
    color: '#140f12',
    transition: `transform ${MOVE_MS}ms ease-in-out`,
  });
  el.textContent = String(Number(w.id.split('w')[1] ?? 0) + 1);
  document.body.appendChild(el);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    }),
  );
  setTimeout(() => el.remove(), MOVE_MS + 30);
}

/**
 * Подключить движение к фишке: при появлении на новом месте — призрак с прежнего места,
 * сама фишка проявляется, когда он доедет. Фишки в увеличенной карточке (data-no-motion) не едут.
 */
export function useTokenMotion(ref: RefObject<Element | null>, w: Worker): void {
  useLayoutEffect(() => {
    const el = ref.current;
    // Только фишки на поле (не в панели запаса и не в увеличенной карточке).
    if (!el || !el.closest('[data-board]') || el.closest('[data-no-motion]')) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const node = el as HTMLElement | SVGElement;
    const prev = lastRect.get(w.id) ?? (seeded ? reserveRect(rect.width) : null);
    lastRect.set(w.id, rect);
    const moved =
      prev !== null && (Math.abs(prev.left - rect.left) >= 2 || Math.abs(prev.top - rect.top) >= 2);
    // Повторный запуск эффекта (StrictMode), пока призрак ещё едет: фишку снова прячем до конца.
    const flyingLeft = (flying.get(w.id) ?? 0) - Date.now();
    if (!moved && flyingLeft <= 0) return;
    node.style.visibility = 'hidden';
    if (moved && prev) {
      ghost(w, prev, rect);
      flying.set(w.id, Date.now() + MOVE_MS);
      markBusy();
    }
    const show = () => {
      node.style.visibility = '';
    };
    const t = setTimeout(show, Math.max(0, (flying.get(w.id) ?? 0) - Date.now()));
    // При размонтировании или повторном запуске эффекта фишка не должна остаться скрытой.
    return () => {
      clearTimeout(t);
      show();
    };
    // Только при появлении фишки (новое место = новый компонент).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Идёт ли движение или пауза после него (перерисовывается, когда закончится). */
export function useMotionBusy(): boolean {
  const busyUntil = useMotion((s) => s.busyUntil);
  const [, tick] = useState(0);
  const left = busyUntil - Date.now();
  useLayoutEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => tick((n) => n + 1), left + 10);
    return () => clearTimeout(t);
  }, [left]);
  return left > 0;
}
