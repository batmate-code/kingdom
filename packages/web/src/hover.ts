import { create } from 'zustand';

/** Рабочий под курсором на планшете — подсвечивается на поле (автор 24.11). */
export const useHoveredWorker = create<{ id: string | null; set(id: string | null): void }>(
  (set) => ({ id: null, set: (id) => set({ id }) }),
);
