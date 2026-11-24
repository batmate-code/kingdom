/**
 * Эксперимент автора 23.11 «обратные треки, Шпиль и Обелиск» (переключатель influenceModel=reverse,
 * ответы автора пп. 27–33). Треки влияния уходят в минус до REVERSE_TRACK.min; отметки снизу дают
 * награды; на звезде региона стоит либо Шпиль (бывшая Цитадель), либо Обелиск.
 */

/** Награда отметки отрицательного трека. */
export type UndergroundReward =
  | { kind: 'ore'; ore: number }
  /** Право стройки сразу, в этом регионе, по полной цене. */
  | { kind: 'buildRight' }
  /** Постоянная сила в боях этого региона (не снимается в конце раунда). */
  | { kind: 'strength'; strength: number }
  /** Можно строить Обелиск. */
  | { kind: 'obelisk' };

export const REVERSE_TRACK = {
  /** Нижний предел влияния во всех регионах. */
  min: -4,
  /**
   * Отметки снизу. `once` — награда один раз за партию на игрока и регион; иначе — каждый раз,
   * когда влияние опускается до отметки или ниже неё (автор 24.11: −1 и −2 не одноразовые).
   */
  marks: [
    { at: -1, once: false, reward: { kind: 'ore', ore: 1 } },
    { at: -2, once: false, reward: { kind: 'buildRight' } },
    { at: -3, once: true, reward: { kind: 'strength', strength: 1 } },
    { at: -4, once: true, reward: { kind: 'obelisk' } },
  ] as readonly { at: number; once: boolean; reward: UndergroundReward }[],
  /** Шпиль: постоянные ПО вместо обычной награды за победу в бою своего региона. */
  spireVp: 1,
  /** Обелиск: компромат владельцу, когда соперник выигрывает бой в его регионе. */
  obeliskCompromatPerRivalWin: 1,
  /** Спуск жетонами боя (автор 24.11): Приманка — до 1 влияния, Отступление — до 2. */
  decoyInfluenceLossMax: 1,
  retreatInfluenceLossMax: 2,
} as const;
