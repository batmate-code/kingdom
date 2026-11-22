import type { ProfessionId } from '@vampire/data';

/**
 * Цвета профессий для интерфейса — мягкие, по легенде автора (docs/images/legend.jpg),
 * с цветом текста под контраст. В data хранится только «какой это цвет», а не оттенок экрана.
 */
const PROFESSION_COLORS: Record<ProfessionId, { bg: string; text: string }> = {
  executioner: { bg: '#d9434f', text: '#fff' },
  guard: { bg: '#4fa865', text: '#fff' },
  aristocrat: { bg: '#f0c93a', text: '#2a2118' },
  architect: { bg: '#3c74c2', text: '#fff' },
  spy: { bg: '#8a62b6', text: '#fff' },
};

export function profColor(id: ProfessionId): string {
  return PROFESSION_COLORS[id].bg;
}

/** Стиль плашки профессии: фон и читаемый текст. */
export function profStyle(id: ProfessionId): { background: string; color: string } {
  return { background: PROFESSION_COLORS[id].bg, color: PROFESSION_COLORS[id].text };
}
