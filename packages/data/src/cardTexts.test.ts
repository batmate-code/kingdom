import { describe, expect, it } from 'vitest';
import { CHARACTERS } from './characters';
import { ALCHEMY, CHARACTER_PARAMS } from './effects';
import { REVERSE_TRACK } from './reverseInfluence';

/** Все числа в объекте параметров (вложенность — один уровень). */
const numbers = (o: object): number[] =>
  Object.values(o).flatMap((v) => (typeof v === 'number' ? [v] : []));

describe('Тексты карт берут числа из параметров', () => {
  it('Персонажи: каждое число в тексте — один из параметров карты (кроме «нельзя при 0»)', () => {
    for (const [id, def] of Object.entries(CHARACTERS)) {
      const params =
        id in CHARACTER_PARAMS ? CHARACTER_PARAMS[id as keyof typeof CHARACTER_PARAMS] : {};
      const allowed = new Set([
        0,
        ...numbers(params),
        ...(id === 'alchemist' ? numbers(ALCHEMY) : []),
        // Ренегат: «нельзя при −4» — дно обратного трека.
        ...(id === 'renegade' ? [-REVERSE_TRACK.min] : []),
      ]);
      for (const n of def.text.match(/\d+/g) ?? []) {
        expect(
          allowed.has(Number(n)),
          `${id}: «${n}» в тексте «${def.text}» нет в параметрах`,
        ).toBe(true);
      }
    }
  });
});
