import { actionLabel, regionName, resText, type Action, type GameState } from '@vampire/core';
import { LOCATIONS } from '@vampire/data';

/**
 * Окно выбора (автор 24.11): вложенный выбор раскладывается на шаги. Каждый ход — путь из
 * подписей шагов; на каждом шаге окно показывает различные подписи среди подходящих ходов.
 * Канцелярия «2 действия» — два шага, Ратуша — обмен, затем регион(ы).
 */
export function choiceSteps(state: GameState, a: Action): string[] {
  if (a.type === 'locationAction') {
    const c = a.choice;
    if (c.kind === 'chancery') {
      const slot = LOCATIONS.chancery.slots[0];
      const oreConv = slot?.kind === 'chancery' ? slot.oreConversion : undefined;
      const steps = c.conversions.map((x) =>
        x.to === 'ore'
          ? `${oreConv?.compromat ?? ''} комп → ${oreConv ? resText(oreConv.gain) : 'руда'}`
          : `1 комп → ${resText({ gold: x.gold, blood: x.blood })}`,
      );
      if (c.buildRight) steps.push('1 комп → право стройки');
      return steps;
    }
    if (c.kind === 'cityHall') {
      const ctx = state.pending?.kind === 'locationAction' ? state.pending.context : undefined;
      const def = LOCATIONS[ctx?.location ?? 'cityHall'].slots[(ctx?.slot ?? 1) - 1];
      const offer = def?.kind === 'cityHall' ? def.offers[c.offer] : undefined;
      const head = offer
        ? `${resText(offer.cost)} → ${offer.influence} влияния`
        : `Обмен ${c.offer + 1}`;
      const where = c.split
        ? `${regionName(c.region)} и ${regionName(c.split)}`
        : regionName(c.region);
      return [`${head}${c.alchemy ? ' (Алхимик)' : ''}`, where];
    }
  }
  return [actionLabel(state, a)];
}

/** Подпись «закончить на этом шаге»: ход, путь которого кончается здесь. */
export const DONE = 'Готово';

export interface StepOption {
  label: string;
  /** Ход, если выбор на этом шаге последний. */
  action: Action | null;
}

/** Канцелярия: действия — набор без порядка (выбрать можно в любой последовательности). */
function unordered(a: Action): boolean {
  return a.type === 'locationAction' && a.choice.kind === 'chancery';
}

/**
 * Совпадает ли путь `path` с началом шагов хода. Для неупорядоченных — путь должен входить в
 * набор шагов; возвращает оставшиеся шаги или null.
 */
function rest(
  steps: readonly string[],
  path: readonly string[],
  anyOrder: boolean,
): string[] | null {
  if (!anyOrder) {
    if (steps.length < path.length || path.some((p, i) => steps[i] !== p)) return null;
    return steps.slice(path.length);
  }
  const left = [...steps];
  for (const p of path) {
    const i = left.indexOf(p);
    if (i < 0) return null;
    left.splice(i, 1);
  }
  return left;
}

/** Варианты очередного шага после выбранного пути `path`. */
export function stepOptions(
  state: GameState,
  actions: readonly Action[],
  path: readonly string[],
): StepOption[] {
  const out: StepOption[] = [];
  const index = new Map<string, number>();
  for (const a of actions) {
    const anyOrder = unordered(a);
    const left = rest(choiceSteps(state, a), path, anyOrder);
    if (left === null) continue;
    // Упорядоченный выбор (Ратуша: обмен → регион) — только следующий шаг; набор (Канцелярия) — любой.
    const labels = left.length === 0 ? [DONE] : anyOrder ? [...new Set(left)] : [left[0] as string];
    for (const label of labels) {
      const leaf = left.length <= 1;
      const at = index.get(label);
      if (at === undefined) {
        index.set(label, out.length);
        out.push({ label, action: leaf ? a : null });
      } else if (!leaf) {
        // У этого шага есть продолжение — это не последний выбор.
        (out[at] as StepOption).action = null;
      }
    }
  }
  return out;
}
