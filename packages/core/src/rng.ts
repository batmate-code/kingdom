/** Генератор mulberry32: всё его состояние — одно 32-битное число, оно хранится в GameState.rng. */
export function nextRandom(state: number): [value: number, nextState: number] {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

export function seedToState(seed: number): number {
  return seed | 0;
}

/** Случайное целое 0..n-1; сдвигает генератор в holder. */
export function randomInt(holder: { rng: number }, n: number): number {
  const [value, next] = nextRandom(holder.rng);
  holder.rng = next;
  return Math.floor(value * n);
}

/** Тасование Фишера — Йетса на месте. */
export function shuffleInPlace<T>(holder: { rng: number }, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(holder, i + 1);
    const a = items[i] as T;
    items[i] = items[j] as T;
    items[j] = a;
  }
}
